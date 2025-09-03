// models/Customer.js
const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // Mijoz nomi
    phone: {
      type: String,
      trim: true,
      sparse: true, // bo‘sh bo‘lsa index buzilmaydi
      unique: true, // dublikat raqam bo‘lmasligi uchun
    },
    address: { type: String, trim: true },

    // 📊 Statistikalar (avtomatik yangilanadi)
    totalPurchased: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    totalDebt: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

/**
 * 🧩 Helper method: mijoz balansini yangilash
 * @param {Number} purchase - jami xarid qiymati qo‘shiladi
 * @param {Number} paid - to‘lov qo‘shiladi
 */
customerSchema.methods.updateBalance = function (purchase = 0, paid = 0) {
  this.totalPurchased += Number(purchase) || 0;
  this.totalPaid += Number(paid) || 0;
  this.totalDebt = Math.max(this.totalPurchased - this.totalPaid, 0);
  return this.save();
};

// 🔎 Tezkor qidiruvlar uchun indekslar
customerSchema.index({ name: "text", phone: "text", address: "text" });

customerSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Customer", customerSchema);
