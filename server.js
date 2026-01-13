import express from "express";
import cors from "cors";
import "dotenv/config";
import userRoutes from "./routes/user.js";
import farmerRoutes from "./routes/farmer.js";
import collectorRoutes from "./routes/collector.js";
import processorRoutes from "./routes/processor.js";
import distributorRoutes from "./routes/distributor.js";
import exporterRoutes from "./routes/exporter.js";
import blockchainRouter from "./routes/blockchain.js";
import { blockchainService } from "./blockchain/BlockchainService.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", userRoutes);
app.use("/api/farmer", farmerRoutes);
app.use("/api/collector", collectorRoutes);
app.use("/api/processor", processorRoutes);
app.use("/api/distributor", distributorRoutes);
app.use("/api/exporter", exporterRoutes);
app.use("/api/blockchain", blockchainRouter);

const port = process.env.PORT || 3000;

async function startServer() {
  try {
    // initialize blockchain service
    await blockchainService.initialize();
    app.listen(port, () => {
      console.log(`[SR] Server is running on port ${port}`);
    });
  } catch (error) {
    app.listen(port, () => {
      console.log(`[SR] Server is running on port ${port} BC failed ${error.message}`);
    });
  }
}

startServer();
