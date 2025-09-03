// models/Sale.js
const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    agent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent", // qaysi agent sotgan
      required: false, // admin ham sotishi mumkin
    },
    products: [
      {
        product_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Store",
          required: true,
        },
        name: String,
        unit: String,
        price: Number,
        purchase_price: Number,
        quantity: Number,
        currency: String,
        partiya_number: Number,
      },
    ],
    total_amount: { type: Number, required: true, min: 0 },
    paid_amount: { type: Number, default: 0, min: 0 },
    remaining_debt: {
      type: Number,
      min: 0,
      default: function () {
        return Math.max(this.total_amount - this.paid_amount, 0);
      },
    },

    payment_method: {
      type: String,
      enum: ["cash", "card", "qarz", "mixed"],
      default: "cash",
    },
    payment_history: [
      { amount: Number, date: { type: Date, default: Date.now } },
    ],
    // 📌 yangi qo‘shilgan
 
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
