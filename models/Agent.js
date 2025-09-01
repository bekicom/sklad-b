const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    login: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },

    // ✅ Role — faqat "agent"
    role: { type: String, enum: ["agent"], default: "agent", immutable: true },

    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

agentSchema.index({ phone: 1 }, { unique: true });
agentSchema.index({ login: 1 }, { unique: true });

module.exports = mongoose.model("Agent", agentSchema);
