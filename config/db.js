const mongoose = require("mongoose");

let isConnecting = false;
let isConnected = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async () => {
  if (isConnected) return mongoose.connection;
  if (isConnecting) return mongoose.connection;

  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI topilmadi (.env ni tekshiring)");
    return null;
  }

  isConnecting = true;

  while (!isConnected) {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
      });

      isConnected = true;
      isConnecting = false;

      console.log(`✅ MongoDB ulandi: ${conn.connection.host}`);

      mongoose.connection.on("disconnected", () => {
        isConnected = false;
        console.warn("⚠️ MongoDB uzildi, qayta ulanish kutilmoqda...");
      });

      return conn;
    } catch (error) {
      console.error(`❌ MongoDB ulanish xatosi: ${error.message}`);
      console.log("🔁 5 soniyadan keyin qayta uriniladi...");
      await sleep(5000);
    }
  }
};

module.exports = connectDB;
