const Client = require("../models/Client");
const Import = require("../models/Import");

// 🔘 Client yaratish (importda ishlatiladi)
exports.createClient = async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const existing = await Client.findOne({ phone });

    if (existing) {
      return res.status(200).json(existing); // allaqachon bor bo‘lsa, qaytaramiz
    }

    const client = new Client({ name, phone, address });
    await client.save();
    res.status(201).json(client);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Client yaratishda xatolik", error: err.message });
  }
};

// 🔘 Barcha clientlar
exports.getClients = async (req, res) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.status(200).json(clients);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Clientlarni olishda xatolik", error: err.message });
  }
};

// 🔘 Bitta clientni olish
exports.getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: "Client topilmadi" });
    }
    res.status(200).json(client);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Clientni olishda xatolik", error: err.message });
  }
};

// 🔘 Client yangilash
exports.updateClient = async (req, res) => {
  try {
    const updated = await Client.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.status(200).json(updated);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Clientni yangilashda xatolik", error: err.message });
  }
};

// 🔘 Client o‘chirish
exports.deleteClient = async (req, res) => {
  try {
    await Client.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Client o‘chirildi" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Clientni o‘chirishda xatolik", error: err.message });
  }
};

// 🔘 Qarz to‘lash
exports.payDebt = async (req, res) => {
  try {
    const { amount } = req.body;
    const client = await Client.findById(req.params.clientId);

    if (!client) {
      return res.status(404).json({ message: "Client topilmadi" });
    }

    client.totalDebt -= amount;
    if (client.totalDebt < 0) client.totalDebt = 0;

    await client.save();

    res.status(200).json({ message: "To‘lov qabul qilindi", client });
  } catch (err) {
    res.status(500).json({ message: "To‘lovda xatolik", error: err.message });
  }
};

// 🔎 Barcha importlar (partiyalar)
exports.getAllImports = async (req, res) => {
  try {
    const imports = await Import.find()
      .populate("client") // client haqida to‘liq ma’lumot
      .sort({ createdAt: -1 });

    res.status(200).json(imports);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Importlarni olishda xatolik", error: err.message });
  }
};

// 🔍 Bitta import (partiya)ni olish
exports.getImportById = async (req, res) => {
  try {
    const importData = await Import.findById(req.params.id).populate("client");

    if (!importData) {
      return res.status(404).json({ message: "Import topilmadi" });
    }

    res.status(200).json(importData);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Importni olishda xatolik", error: err.message });
  }
};

// 📊 Yetkazib beruvchi (Client) statistikasi
exports.getClientStats = async (req, res) => {
  try {
    const clientId = req.params.id;

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client topilmadi" });
    }

    const imports = await Import.find({ client: clientId });

    // Partiyalar soni
    const totalPartiya = imports.length;

    // Umumiy yuk qiymati (UZSga aylantirib)
    let totalAmountUZS = 0;
    imports.forEach((imp) => {
      imp.products.forEach((p) => {
        let priceUZS =
          p.currency === "USD"
            ? p.total_price * (imp.usd_to_uzs_rate || 0)
            : p.total_price;
        totalAmountUZS += priceUZS;
      });
    });

    // Umumiy qarz
    const totalDebt = client.totalDebt || 0;

    res.status(200).json({
      client: {
        name: client.name,
        phone: client.phone,
        address: client.address,
      },
      totalPartiya,
      totalAmountUZS,
      totalDebt,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Statistikani olishda xatolik", error: err.message });
  }
};
exports.getClientPayments = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await Client.findById(id).select("payments name phone");
    if (!client) {
      return res.status(404).json({ message: "Mijoz topilmadi" });
    }

    res.json(client.payments || []);
  } catch (error) {
    console.error("getClientPayments error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
};