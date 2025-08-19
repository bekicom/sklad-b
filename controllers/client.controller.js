const Client = require("../models/Client");
const Import = require("../models/Import");

// 🔘 Client yaratish
exports.createClient = async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    const existing = await Client.findOne({ phone });
    if (existing) {
      return res.status(200).json(existing);
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
    if (!client) return res.status(404).json({ message: "Client topilmadi" });
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

// 🔘 Client o'chirish
exports.deleteClient = async (req, res) => {
  try {
    await Client.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Client o'chirildi" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Clientni o'chirishda xatolik", error: err.message });
  }
};

// 🔘 Qarz to'lash
exports.payDebt = async (req, res) => {
  try {
    const { amount, note } = req.body;
    console.log(req.body);

    const client = await Client.findById(req.params.clientId);

    if (!client) return res.status(404).json({ message: "Client topilmadi" });
    if (!amount || amount <= 0)
      return res.status(400).json({ message: "To'lov summasi noto'g'ri" });
    if (amount > client.totalDebt)
      return res
        .status(400)
        .json({ message: "To'lov summasi qarzdan ko'p bo'lishi mumkin emas" });

    // To'lov tarixiga qo‘shish
    client.paymentHistory.push({
      amount,
      date: new Date(),
      note: note || "Qarz to'lovi",
    });

    // Umumiy to‘langan summa va qolgan qarz
    client.totalPaid += amount;
    client.totalDebt -= amount;
    if (client.totalDebt < 0) client.totalDebt = 0;

    await client.save();

    res.status(200).json({
      message: "To'lov qabul qilindi",
      client: {
        _id: client._id,
        name: client.name,
        phone: client.phone,
        address: client.address,
        totalPaid: client.totalPaid,
        totalDebt: client.totalDebt,
        paymentHistory: client.paymentHistory,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "To'lovda xatolik", error: err.message });
  }
};

// 📊 Client statistikasi
exports.getClientStats = async (req, res) => {
  try {
    const clientId = req.params.id;
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ message: "Client topilmadi" });

    const imports = await Import.find({ supplier_id: clientId });

    const totalPartiya = imports.length;
    let totalAmountUZS = 0;

    imports.forEach((imp) => {
      imp.products.forEach((p) => {
        const priceUZS =
          p.currency === "USD"
            ? p.total_price * (imp.usd_to_uzs_rate || 0)
            : p.total_price;
        totalAmountUZS += priceUZS;
      });
    });

    res.status(200).json({
      client: {
        name: client.name,
        phone: client.phone,
        address: client.address,
      },
      partiesCount: totalPartiya,
      totalAmount: totalAmountUZS,
      totalPaid: client.totalPaid || 0,
      totalDebt: client.totalDebt || 0,
      paymentCount: client.paymentHistory?.length || 0,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Statistikani olishda xatolik", error: err.message });
  }
};

// 📜 To'lov tarixi
exports.getClientPayments = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await Client.findById(id).select(
      "paymentHistory name phone"
    );
    if (!client) return res.status(404).json({ message: "Client topilmadi" });

    res.json(client.paymentHistory || []);
  } catch (err) {
    res.status(500).json({ message: "Server xatosi", error: err.message });
  }
};

// 📦 Client import/mahsulot tarixi
exports.getClientImportsHistory = async (req, res) => {
  try {
    const clientId = req.params.id;

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client topilmadi" });
    }

    // Client importlarini olish
    const imports = await Import.find({ supplier_id: clientId }).sort({
      createdAt: -1,
    });

    res.status(200).json(imports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server xatosi", error: err.message });
  }
};

exports.addDebt = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { amount } = req.body;
    await Client.findByIdAndUpdate(clientId, { $inc: { totalDebt: amount } });
    res.status(200).json({ message: "Qarz qo'shildi" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server xatosi", error: err.message });
  }
};
