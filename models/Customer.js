// models/Customer.js
const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // Mijoz nomi
    phone: { type: String, trim: true }, // Telefon raqami
    address: { type: String, trim: true }, // Manzili
    totalPurchased: { type: Number, default: 0 }, // Jami olingan mahsulot qiymati
    totalPaid: { type: Number, default: 0 }, // Jami to‘langan
    totalDebt: { type: Number, default: 0 }, // Qolgan qarz
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);
