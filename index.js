import express from "express";
const app = express();
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import dotenv from "dotenv";
import webhookRouter from "./webhook.js";
dotenv.config();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000


const config = new MercadoPagoConfig({
  accessToken: process.env.ACCESS_TOKEN, // o tu token directo
});

const preapproval = new PreApproval(config);

app.post("/crear-suscripcion", async (req, res) => {
  try {
      
      const { userId, barberiaId, planId, cortesPlan, monto, userEmail, nombreUsuario } = req.body;
      
      const body = {
          reason: `${planId}_${cortesPlan}-user_${userId}_${nombreUsuario}-barberia_${barberiaId}`,
          auto_recurring: {
              frequency: 1,
              frequency_type: "months",
              transaction_amount: Number(monto),
              currency_id: "ARS",
              start_date: new Date().toISOString(),
              end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString(),
            },
      back_url: "https://beardhook.onrender.com", // Cambiar
      payer_email: "test_user_491019957@testuser.com", // Esto se reemplaza luego por el email real 
      external_reference: barberiaId,
    };
    
    console.log("req.body recibido:", req.body);
    const newSuscriber = await preapproval.create({ body });

    console.log("✅ Suscripción creada:", newSuscriber);
    res.status(200).json({ init_point: newSuscriber.init_point });
  } catch (error) {
    console.error("❌ Error creando suscripción:", error);
    res.status(500).json({ error: error.message });
  }
});

try {
  app.use("/", webhookRouter);
} catch(error) {
  console.error("error conectando a webhook", error)
} 

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});