const AppDocument = require('../models/AppDocument');
const Attachment = require('../models/Attachment');
const DesignChapter = require('../models/DesignChapter');
const DesignEntry = require('../models/DesignEntry');
const { repoPath } = require('../utils/git');
const { scanRepo } = require('../utils/designScan');
const { removeFiles, serializeAttachment } = require('../utils/attachments');

const metaDocName = (repo) => `design-scan:${repo}`;

// Chapters a scan maintains (created on first scan, found again via scanKey)
const TOKENS_CHAPTER = { scanKey: 'tokens', title: 'Design Tokens', order: 0 };
const COMPONENTS_CHAPTER = { scanKey: 'components', title: 'Components', order: 1 };
const flowChapter = (flow) => ({ scanKey: `flow:${flow}`, title: `Screens · ${flow}`, order: 10 });

async function ensureChapter(repo, { scanKey, title, order }) {
    const existing = await DesignChapter.findOne({ repo, scanKey });
    if (existing) return existing;
    return DesignChapter.create({ repo, scanKey, title, order });
}

const isFilled = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

// Merge scanned data into an entry: technical fields come from the scan, user-owned fields are kept
async function upsertEntry({ repo, chapterId, scanKey, type, title, scanned, keepFields, defaults }) {
    const existing = await DesignEntry.findOne({ repo, 'data.scanKey': scanKey });
    if (!existing) {
        const order = await DesignEntry.countDocuments({ repo, chapterId });
        await DesignEntry.create({ repo, chapterId, type, title, order, data: { ...defaults, ...scanned, scanKey, missing: false } });
        return 'created';
    }
    const data = { ...existing.data, ...scanned, scanKey, missing: false };
    for (const field of keepFields) {
        if (isFilled(existing.data?.[field])) data[field] = existing.data[field];
    }
    existing.data = data;
    existing.markModified('data');
    await existing.save();
    return 'updated';
}

// @desc    Scan a repo and create/update its design book (tokens, components, screens)
// @route   POST /api/design/scan  { repo }
exports.scan = async (req, res, next) => {
    try {
        const { repo } = req.body || {};
        const dir = repoPath(repo); // validates the name; 404 if it is not a repo
        const result = await scanRepo(dir);
        const counts = { created: 0, updated: 0, missing: 0 };
        const seen = new Set();

        // Tokens: one auto entry, refreshed from the repo on every scan
        const t = result.tokens;
        if (Object.values(t).some(list => list.length)) {
            const chapter = await ensureChapter(repo, TOKENS_CHAPTER);
            seen.add('tokens:auto');
            counts[await upsertEntry({
                repo, chapterId: chapter._id, scanKey: 'tokens:auto', type: 'tokens', title: 'Tokens (from repo)',
                scanned: { colors: t.colors, typography: t.typography, spacing: t.spacing, radii: t.radii, shadows: t.shadows },
                keepFields: [], defaults: {},
            })] += 1;
        }

        if (result.components.length) {
            const chapter = await ensureChapter(repo, COMPONENTS_CHAPTER);
            for (const c of result.components) {
                const scanKey = `component:${c.path}`;
                seen.add(scanKey);
                counts[await upsertEntry({
                    repo, chapterId: chapter._id, scanKey, type: 'component', title: c.name,
                    scanned: { name: c.name, path: c.path, props: c.props, usageCount: c.usageCount, snippet: c.snippet, exported: c.exported },
                    keepFields: ['description', 'descriptionSource', 'status', 'variants', 'screenshots'],
                    defaults: { description: c.description, descriptionSource: c.description ? 'scan' : '', status: 'draft', variants: [], screenshots: [] },
                })] += 1;
            }
        }

        for (const s of result.screens) {
            const chapter = await ensureChapter(repo, flowChapter(s.flow || 'app'));
            const scanKey = `screen:${s.route}|${s.path}`;
            seen.add(scanKey);
            counts[await upsertEntry({
                repo, chapterId: chapter._id, scanKey, type: 'screen', title: s.name,
                scanned: { name: s.name, route: s.route, path: s.path, router: s.router, flow: s.flow },
                keepFields: ['description', 'descriptionSource', 'screenshots'],
                defaults: { description: '', descriptionSource: '', screenshots: [] },
            })] += 1;
        }

        // Things that disappeared from the repo are flagged, never deleted (they may hold notes/screenshots)
        const stale = await DesignEntry.find({ repo, 'data.scanKey': { $nin: [...seen], $exists: true } });
        for (const e of stale) {
            if (e.data.missing) continue;
            e.data = { ...e.data, missing: true };
            e.markModified('data');
            await e.save();
            counts.missing += 1;
        }

        const meta = {
            framework: result.framework,
            stats: result.stats,
            totals: {
                colors: t.colors.length, typography: t.typography.length, spacing: t.spacing.length,
                radii: t.radii.length, shadows: t.shadows.length,
                components: result.components.length, screens: result.screens.length,
            },
            scannedAt: new Date(),
        };
        await AppDocument.findOneAndUpdate({ key: metaDocName(repo) }, { content: JSON.stringify(meta) }, { upsert: true });

        res.status(200).json({ success: true, data: { ...meta, ...counts } });
    } catch (error) {
        next(error);
    }
};

// @desc    Last scan info of a repo design book
// @route   GET /api/design/scan?repo=
exports.getScanInfo = async (req, res, next) => {
    try {
        const doc = await AppDocument.findOne({ key: metaDocName(req.query.repo) }).lean();
        res.status(200).json({ success: true, data: doc ? JSON.parse(doc.content) : null });
    } catch (error) {
        next(error);
    }
};

// @desc    Upload design images (screenshots, mockups) to the local uploads volume
// @route   POST /api/design/assets  (multipart `files`, optional `repo`)
exports.uploadAssets = async (req, res, next) => {
    try {
        const files = req.files || [];
        if (!files.length) {
            const error = new Error('No files uploaded');
            error.statusCode = 400;
            throw error;
        }
        const docs = await Attachment.insertMany(files.map(f => ({
            scope: 'design',
            name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
            mimeType: f.mimetype || 'application/octet-stream',
            size: f.size,
            storageKey: f.filename,
            uploadedBy: req.body?.repo ? `design:${req.body.repo}` : 'design',
        })));
        res.status(201).json({ success: true, data: docs.map(d => serializeAttachment(d.toObject())) });
    } catch (error) {
        await removeFiles(req.files);
        next(error);
    }
};
