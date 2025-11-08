// controllers/store.controller.js
const Store = require("../models/Store");

/**
 * Ombordagi barcha mahsulotlarni olish
 */
const getAllStoreItems = async (req, res) => {
  try {
    const storeItems = await Store.find()
      .populate("supplier_id", "name phone")
      .sort({ createdAt: -1 });

    res.status(200).json(storeItems);
  } catch (error) {
    res.status(500).json({
      message: "Ombor mahsulotlarini olishda xatolik",
      error: error.message,
    });
  }
};

const createStoreFromImport = async (importData) => {
  try {
    console.log("Import data for store:", importData);

    const totalImportPrice = importData.products.reduce(
      (sum, p) => sum + (p.total_price || 0),
      0
    );

    const storeItems = importData.products.map((item) => {
      // Proportsional qarz hisoblash
      const totalPrice = item.total_price || 0;
      const proportionalPaid =
        totalImportPrice > 0
          ? (totalPrice / totalImportPrice) * (importData.paid_amount || 0)
          : 0;
      const remainingDebt = Math.max(totalPrice - proportionalPaid, 0);

      return {
        // ✅ TUZATILDI: product_name ishlatiladi (title emas)
        product_name: item.product_name || item.title, // Ikkalasini ham qo'llab-quvvatlash
        model: item.model || "",
        unit: item.unit,
        quantity: item.quantity || 0,

        // ✅ Qo'lda kiritiladigan narxlar
        purchase_price: item.unit_price || 0, // ✅ TUZATILDI: unit_price dan olinadi
        sell_price: item.sell_price || 0,

        total_price: totalPrice,
        currency: item.currency,
        partiya_number: importData.partiya_number,
        import_id: importData._id,
        supplier_id: importData.supplier_id || importData.client, // ✅ TUZATILDI: supplier_id ishlatiladi
        paid_amount: proportionalPaid,
        remaining_debt: remainingDebt,
        note: item.note || "",
      };
    });

    console.log("Store items to create:", storeItems);
    await Store.insertMany(storeItems);
  } catch (error) {
    console.error("Store yaratishda xatolik:", error);
    throw error;
  }
};

const getAllStoreProducts = async (req, res) => {
  try {
    const products = await Store.aggregate([
      {
        $group: {
          _id: "$product_name",
          totalQuantity: { $sum: "$quantity" },
          avgSellPrice: { $avg: "$sell_price" },
          lastCurrency: { $last: "$currency" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({
      message: "Ombordagi mahsulotlarni olishda xatolik",
      error: error.message,
    });
  }
};

const deleteStoreItem = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedItem = await Store.findByIdAndDelete(id);

    if (!deletedItem) {
      return res.status(404).json({ message: "Mahsulot topilmadi" });
    }

    res.status(200).json({ message: "Mahsulot o'chirildi" });
  } catch (error) {
    res.status(500).json({
      message: "Mahsulotni o'chirishda xatolik",
      error: error.message,
    });
  }
};

const getGroupedStoreItems = async (req, res) => {
  try {
    const usd_rate = Number(req.query.usd_rate) || 0;
    const storeItems = await Store.find().populate("supplier_id");

    const map = {};
    storeItems.forEach((item) => {
      const key = `${item.supplier_id?._id}-${item.partiya_number}`;
      if (!map[key]) {
        map[key] = {
          supplier: item.supplier_id,
          partiya_number: item.partiya_number,
          products: [],
          total_price: 0,
          total_paid: 0,
          total_debt: 0,
        };
      }

      let priceUZS = item.total_price || 0;
      let paidUZS = item.paid_amount || 0;
      let debtUZS = item.remaining_debt || 0;

      if (item.currency === "USD") {
        priceUZS *= usd_rate;
        paidUZS *= usd_rate;
        debtUZS *= usd_rate;
      }

      map[key].products.push(item);
      map[key].total_price += priceUZS;
      map[key].total_paid += paidUZS;
      map[key].total_debt += debtUZS;
    });

    const groupedData = Object.values(map).map((g) => ({
      ...g,
      total_price: Number(g.total_price.toFixed(2)),
      total_paid: Number(g.total_paid.toFixed(2)),
      total_debt: Number(g.total_debt.toFixed(2)),
    }));

    res.status(200).json(groupedData);
  } catch (error) {
    res.status(500).json({ message: "Grouping xatolik", error: error.message });
  }
};

/**
 * Import ID bo'yicha mahsulotlarni olish
 */
const gSImportId = async (req, res) => {
  try {
    const { importId } = req.params;
    const items = await Store.find({ import_id: importId });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
const updateStoreItem = async (req, res) => {
  try {
    const { id } = req.params;

    // Validatsiya qo'shish
    const allowedUpdates = [
      "product_name",
      "model",
      "unit",
      "quantity",
      "purchase_price",
      "sell_price",
      "currency",
      "partiya_number",
      "paid_amount",
      "remaining_debt",
      "note",
    ];

    const updates = Object.keys(req.body);
    const isValidOperation = updates.every((update) =>
      allowedUpdates.includes(update)
    );

    if (!isValidOperation) {
      return res.status(400).json({ message: "Noto'g'ri maydon!" });
    }

    // Agar narx o'zgarsa, total_price ni qayta hisoblash
    if (req.body.quantity || req.body.purchase_price) {
      const quantity = req.body.quantity;
      const purchase_price = req.body.purchase_price;

      if (quantity && purchase_price) {
        req.body.total_price = quantity * purchase_price;
      }
    }

    const updatedItem = await Store.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    }).populate("supplier_id", "name phone");

    if (!updatedItem) {
      return res.status(404).json({ message: "Mahsulot topilmadi" });
    }

    res.status(200).json(updatedItem);
  } catch (error) {
    res.status(500).json({
      message: "Mahsulotni yangilashda xatolik",
      error: error.message,
    });
  }
};

module.exports = {
  getAllStoreProducts,
  getAllStoreItems,
  gSImportId,
  createStoreFromImport,
  updateStoreItem,
  deleteStoreItem,
  getGroupedStoreItems,
};
