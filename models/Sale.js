const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    customer_id: {
      // 🔹 nomini ham o‘zgartirdik
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    products: [
      {
        product_id: { type: mongoose.Schema.Types.ObjectId, ref: "Store" },
        name: String,
        unit: String,
        price: Number,
        purchase_price: Number,
        quantity: Number,
        currency: String,
        partiya_number: Number,
      },
    ],
    total_amount: { type: Number, required: true },
    paid_amount: { type: Number, default: 0 },
    payment_method: {
      type: String,
      enum: ["cash", "card", "qarz"],
      default: "cash",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
