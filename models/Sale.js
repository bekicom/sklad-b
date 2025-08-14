const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true, // Xaridor bo‘lishi shart
    },
    products: [
      {
        product_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Store",
          required: true,
        },
        name: { type: String, required: true },
        unit: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        purchase_price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 0.001 }, // 0.001 kg gacha
        currency: { type: String, enum: ["UZS", "USD"], required: true },
        partiya_number: { type: Number, required: true },
      },
    ],
    total_amount: { type: Number, required: true, min: 0 },
    paid_amount: { type: Number, default: 0, min: 0 },
    remaining_debt: { type: Number, default: 0, min: 0 }, // Qolgan qarz
    payment_method: {
      type: String,
      enum: ["cash", "card", "qarz", "mixed"],
      default: "cash",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
