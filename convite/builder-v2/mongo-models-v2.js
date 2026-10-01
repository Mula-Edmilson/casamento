'use strict';

const INVITE_CONTENT_STAGES = Object.freeze(['draft', 'published']);
const FORM_SUBMISSION_STATUSES = Object.freeze(['new', 'reviewing', 'imported', 'rejected', 'archived']);

function createBuilderV2Schemas(mongoose) {
  if (!mongoose || !mongoose.Schema) throw new Error('mongoose é obrigatório.');

  const InviteContentSchema = new mongoose.Schema({
    inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', required: true, unique: true, index: true },
    slug: { type: String, required: true, index: true, lowercase: true, trim: true },
    schemaVersion: { type: String, default: '2.0', index: true },
    draft: { type: mongoose.Schema.Types.Mixed, default: {} },
    published: { type: mongoose.Schema.Types.Mixed, default: {} },
    draftRevision: { type: Number, default: 1, min: 1 },
    publishedRevision: { type: Number, default: 0, min: 0 },
    publishedAt: { type: Date },
    publishedByRole: { type: String, default: '' },
    lastEditedByRole: { type: String, default: '' },
    publishHash: { type: String, default: '', index: true }
  }, { timestamps: true, strict: true });
  InviteContentSchema.index({ slug: 1, schemaVersion: 1 });
  InviteContentSchema.index({ updatedAt: -1 });

  const InviteContentRevisionSchema = new mongoose.Schema({
    inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', required: true, index: true },
    slug: { type: String, required: true, index: true, lowercase: true, trim: true },
    revision: { type: Number, required: true, min: 1 },
    stage: { type: String, enum: INVITE_CONTENT_STAGES, required: true, index: true },
    schemaVersion: { type: String, default: '2.0' },
    content: { type: mongoose.Schema.Types.Mixed, required: true },
    contentHash: { type: String, required: true, index: true },
    note: { type: String, default: '' },
    createdByRole: { type: String, default: '' }
  }, { timestamps: true, strict: true });
  InviteContentRevisionSchema.index({ inviteId: 1, revision: 1, stage: 1 }, { unique: true });
  InviteContentRevisionSchema.index({ inviteId: 1, createdAt: -1 });

  const FormSubmissionSchema = new mongoose.Schema({
    submissionKey: { type: String, required: true, unique: true, index: true, trim: true },
    packageKey: { type: String, enum: ['perola', 'esmeralda', 'rubi'], required: true, index: true },
    status: { type: String, enum: FORM_SUBMISSION_STATUSES, default: 'new', index: true },
    source: { type: String, default: 'lirandzo-form', index: true },
    sourceReference: { type: String, default: '', index: true },
    clientName: { type: String, default: '', trim: true },
    clientEmail: { type: String, default: '', trim: true, lowercase: true, index: true },
    clientPhone: { type: String, default: '', trim: true },
    coupleNames: { type: String, default: '', trim: true },
    rawData: { type: mongoose.Schema.Types.Mixed, default: {} },
    normalizedDraft: { type: mongoose.Schema.Types.Mixed, default: {} },
    validation: { type: mongoose.Schema.Types.Mixed, default: {} },
    inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invite', index: true },
    importedAt: { type: Date },
    importedByRole: { type: String, default: '' },
    notes: { type: String, default: '' }
  }, { timestamps: true, strict: true });
  FormSubmissionSchema.index({ status: 1, createdAt: -1 });
  FormSubmissionSchema.index({ packageKey: 1, status: 1, createdAt: -1 });

  return { InviteContentSchema, InviteContentRevisionSchema, FormSubmissionSchema };
}

function createBuilderV2Models(mongoose) {
  if (!mongoose || typeof mongoose.model !== 'function') throw new Error('mongoose é obrigatório.');
  const schemas = createBuilderV2Schemas(mongoose);
  return {
    InviteContent: mongoose.models.InviteContent || mongoose.model('InviteContent', schemas.InviteContentSchema),
    InviteContentRevision: mongoose.models.InviteContentRevision || mongoose.model('InviteContentRevision', schemas.InviteContentRevisionSchema),
    FormSubmission: mongoose.models.FormSubmission || mongoose.model('FormSubmission', schemas.FormSubmissionSchema)
  };
}

module.exports = {
  INVITE_CONTENT_STAGES,
  FORM_SUBMISSION_STATUSES,
  createBuilderV2Schemas,
  createBuilderV2Models
};
