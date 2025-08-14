// models/Debtor.js
const mongoose = require("mongoose");

const debtorSchema = new mongoose.Schema({
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    required: true,
  },
  products: [
    {
      product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
      quantity: Number,
      price: Number,
    },
  ],
  totalAmount: Number,
  paidAmount: { type: Number, default: 0 },
  remainingAmount: Number,
});

module.exports = mongoose.model("Debtor", debtorSchema);
