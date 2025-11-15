// controllers/import.controller.js
const Import = require("../models/Import");
const Client = require("../models/Client");
const { createStoreFromImport } = require("./store.controller");

/**
 * 📌 Yangi import yaratish
 */
const createImport = async (req, res) => {
  try {
    const {
      client_name,
      phone,
      address = "",
      usd_rate = 0,
      paid_amount = 0,
      products,
      note = "",
    } = req.body;

    if (!client_name || !phone)
      return res
        .status(400)
        .json({ message: "Mijoz nomi va telefon kiritilishi kerak" });

    if (!Array.isArray(products) || products.length === 0)
      return res
        .status(400)
        .json({ message: "Kamida bitta mahsulot bo'lishi kerak" });

    if (products.some((p) => p.currency === "USD") && usd_rate <= 0)
      return res
        .status(400)
        .json({ message: "USD mahsulotlar uchun kurs kiritilishi kerak" });

    // Mijozni topish yoki yaratish
    let client = await Client.findOne({ phone: phone.trim() });
    if (!client) {
      client = await Client.create({
        name: client_name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        totalDebt: 0,
        paymentHistory: [],
      });
    }

    // Partiya raqami
    const lastImport = await Import.findOne().sort({ partiya_number: -1 });
    const nextPartiyaNumber = lastImport
      ? Number(lastImport.partiya_number) + 1
      : 1;

    let totalImportPriceUZS = 0;

    const processedProducts = products.map((p, i) => {
      const name = p.product_name || p.title;
      if (!name?.trim()) throw new Error(`Mahsulot nomi bo'sh (${i + 1})`);
      if (!p.unit?.trim())
        throw new Error(`O'lchov birligi ko'rsatilmagan (${i + 1})`);
      if (typeof p.quantity !== "number" || p.quantity <= 0)
        throw new Error(`Noto'g'ri miqdor (${i + 1})`);
      if (typeof p.unit_price !== "number" || p.unit_price <= 0)
        throw new Error(`Unit price kiritilmagan (${i + 1})`);
      if (typeof p.total_price !== "number" || p.total_price <= 0)
        throw new Error(`Total price kiritilmagan (${i + 1})`);
      if (typeof p.sell_price !== "number" || p.sell_price <= 0)
        throw new Error(`Sotish narxi kiritilmagan (${i + 1})`);
      if (!p.currency || !["USD", "UZS"].includes(p.currency))
        throw new Error(`Noto'g'ri valyuta (${i + 1})`);

      const priceUZS =
        p.currency === "USD" ? p.total_price * usd_rate : p.total_price;
      totalImportPriceUZS += priceUZS;

      return {
        product_name: name.trim(),
        model: p.model?.trim() || "",
        unit: p.unit.trim(),
        quantity: Number(p.quantity),
        box_quantity: Number(p.box_quantity || 0),
        unit_price: Number(p.unit_price.toFixed(2)),
        total_price: Number(p.total_price.toFixed(2)),
        sell_price: Number(p.sell_price.toFixed(2)),
        currency: p.currency,
        price_uzs: Number(priceUZS.toFixed(2)),
        paid_amount: 0,
        remaining_debt: 0,
      };
    });

    // Qarzdorlik va to'lovlarni hisoblash
    processedProducts.forEach((product) => {
      const share =
        totalImportPriceUZS > 0 ? product.price_uzs / totalImportPriceUZS : 0;
      product.paid_amount = Number((share * paid_amount).toFixed(2));
      product.remaining_debt = Number(
        (product.price_uzs - product.paid_amount).toFixed(2)
      );
    });

    // Import yaratish
    const newImport = await Import.create({
      supplier_id: client._id,
      usd_to_uzs_rate: Number(usd_rate),
      paid_amount: Number(paid_amount.toFixed(2)),
      partiya_number: nextPartiyaNumber,
      products: processedProducts,
      note: note.trim(),
      total_amount_uzs: Number(totalImportPriceUZS.toFixed(2)),
      remaining_debt: Number((totalImportPriceUZS - paid_amount).toFixed(2)),
    });

    // Mijoz qarzdorligini yangilash
    const totalRemainingDebt = processedProducts.reduce(
      (sum, p) => sum + p.remaining_debt,
      0
    );
    client.totalDebt = Number(
      ((client.totalDebt || 0) + totalRemainingDebt).toFixed(2)
    );
    if (paid_amount > 0) {
      if (!Array.isArray(client.paymentHistory)) client.paymentHistory = [];
      client.paymentHistory.push({
        amount: Number(paid_amount),
        date: new Date(),
        note: `${nextPartiyaNumber}-partiya uchun dastlabki to'lov`,
        import_id: newImport._id,
      });
    }
    await client.save();

    try {
      await createStoreFromImport(newImport);
    } catch (storeError) {
      console.warn("Omborga qo'shishda ogohlantirish:", storeError.message);
    }

    const populatedImport = await Import.findById(newImport._id).populate(
      "supplier_id",
      "name phone address totalDebt"
    );

    res.status(201).json({
      success: true,
      message: "Import muvaffaqiyatli yaratildi",
      data: populatedImport,
    });
  } catch (error) {
    console.error("Import yaratishda xatolik:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * 📌 Barcha importlarni olish
 */
const getAllImports = async (req, res) => {
  try {
    const imports = await Import.find().populate("supplier_id", "name phone");
    res.json(imports);
  } catch (error) {
    console.error("getAllImports error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
};

/**
 * 📌 Importni ID bo'yicha olish
 */
const getImportById = async (req, res) => {
  try {
    const importItem = await Import.findById(req.params.id).populate(
      "supplier_id",
      "name phone address totalDebt"
    );
    if (!importItem)
      return res.status(404).json({ message: "Import topilmadi" });
    res.json(importItem);
  } catch (error) {
    console.error("getImportById error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
};

/**
 * 📌 Importlarni mijoz bo'yicha guruhlash
 */
const getImportsGroupedByClient = async (req, res) => {
  try {
    const grouped = await Import.aggregate([
      {
        $lookup: {
          from: "clients",
          localField: "supplier_id",
          foreignField: "_id",
          as: "clientData",
        },
      },
      { $unwind: "$clientData" },
      {
        $group: {
          _id: "$supplier_id",
          client_name: { $first: "$clientData.name" },
          phone: { $first: "$clientData.phone" },
          total_debt: { $sum: "$remaining_debt" },
          imports: { $push: "$$ROOT" },
        },
      },
    ]);
    res.json(grouped);
  } catch (error) {
    console.error("getImportsGroupedByClient error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
};

/**
 * 📌 Oxirgi partiya raqamini olish
 */
const getLastPartiyaNumber = async (req, res) => {
  try {
    const lastImport = await Import.findOne().sort({ partiya_number: -1 });
    res.json({ lastPartiyaNumber: lastImport ? lastImport.partiya_number : 0 });
  } catch (error) {
    console.error("getLastPartiyaNumber error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
};

/**
 * 📌 Import to'lovini yangilash
 */
const updateImportPayment = async (req, res) => {
  try {
    const { amount } = req.body;
    const importItem = await Import.findById(req.params.id);
    if (!importItem)
      return res.status(404).json({ message: "Import topilmadi" });

    importItem.paid_amount += amount;
    importItem.remaining_debt -= amount;

    // Mahsulotlar bo'yicha qarzni yangilash
    const totalPriceUZS = importItem.products.reduce(
      (sum, p) => sum + p.price_uzs,
      0
    );
    importItem.products = importItem.products.map((p) => {
      const share = p.price_uzs / totalPriceUZS;
      p.paid_amount += Number((share * amount).toFixed(2));
      p.remaining_debt = Number((p.price_uzs - p.paid_amount).toFixed(2));
      return p;
    });

    await importItem.save();
    res.json({ message: "To'lov yangilandi", data: importItem });
  } catch (error) {
    console.error("updateImportPayment error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
};

/**
 * 📌 Importni o'chirish
 */
const deleteImport = async (req, res) => {
  try {
    const deleted = await Import.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Import topilmadi" });
    res.json({ message: "Import o'chirildi" });
  } catch (error) {
    console.error("deleteImport error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
};

module.exports = {
  createImport,
  getAllImports,
  getImportById,
  getImportsGroupedByClient,
  getLastPartiyaNumber,
  updateImportPayment,
  deleteImport,
};
