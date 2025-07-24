import express from "express";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

const config = new MercadoPagoConfig({
  accessToken: process.env.ACCESS_TOKEN, // o tu token directo
});

const preaproval = new PreApproval(config);

app.post("/crear-suscripcion", async (req, res) => {
  try {
      
      const { userId, nombrePlan, monto } = req.body;
      
      const body = {
          reason: nombrePlan,
          auto_recurring: {
              frequency: 1,
              frequency_type: "months",
              transaction_amount: Number(monto),
              currency_id: "ARS",
              start_date: new Date().toISOString(),
              end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString(),
            },
      back_url: "https://www.google.com", // Cambiar
      payer_email: "test_user_491019957@testuser.com", // Esto se reemplaza luego por el email real 
    };
    
    console.log("req.body recibido:", req.body);
    const newSuscriber = await preaproval.create({ body });

    console.log("✅ Suscripción creada:", newSuscriber);
    res.status(200).json(newSuscriber);
    res.json({init_point: preaproval.init_point})
  } catch (error) {
    console.error("❌ Error creando suscripción:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});