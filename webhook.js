import express from 'express';
const router = express.Router();
import { admin, db } from './firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import axios from 'axios';
const config = new MercadoPagoConfig({
	accessToken: process.env.ACCESS_TOKEN, // o tu token directo
});

const accessToken = process.env.ACCESS_TOKEN



// Webhook
router.post('/', express.text({ type: "*/*" }), async (req, res) => {
	console.log('✅ Webhook FUNCIONA');
	console.log('Query:', req.query);
	console.log('Body:', req.body);
	console.log("📩 Webhook recibido:", JSON.stringify(req.body, null, 2));

	const { action, type, data, id } = req.body;

	if (data.id === "test_preapproval_id") {
		console.log("🧪 Webhook de prueba ignorado.");
		return res.sendStatus(200);
	}

	// 🧩 NUEVO BLOQUE: manejo de pagos autorizados
	if (type === "subscription_authorized_payment" && action === "created") {
		console.log("🔔 Webhook recibido: subscription_authorized_payment", data);
		try {
			const preapprovalId = data.id
			console.log("🔄 Buscando pagos hechos con esta suscripción...");
			// Consultar la suscripción en base al preapproval_id
			const paymentsResp = await axios.get("https://api.mercadopago.com/preapproval/search", {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				params: {
					preapproval_id: preapprovalId,
					sort: "date_created",
					order: "desc",
					limit: 1,
				}
			});
			const payments = paymentsResp.data.results;

			if (!payments || payments.length === 0) {
				console.log("❌ No se encontraron pagos con esta suscripción");
				return res.sendStatus(404);
			}

			const payment = payments[0];
			console.log("✅ Último pago encontrado:", payment);

			if (payment.status !== "authorized") {
				console.log(`ℹ️ Pago con estado '${payment.status}', no se procesa.`);
				return res.sendStatus(200);
			}

			// Hacer GET al recurso de payment para obtener la preapproval_id
			const subsResp = await axios.get(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				}
			});
			const subs = subsResp.data;

			if (subs.status !== "authorized") {
				console.log(`ℹ️ Suscripción aún no está autorizada (${subs.status})`);
				return res.sendStatus(200);
			}

			console.log("✅ Suscripción AUTORIZADA detectada desde el pago:", subs);

			await guardarSuscripcion(subs);
			await actualizarFirestoreTrasSuscripcion(subs)

			return res.sendStatus(200);

		} catch (err) {
			console.error("❌ Error al manejar authorized_payment:", err);
			return res.sendStatus(500);
		}
	}

	// 🧩 BLOQUE EXISTENTE: subscription actualizada directamente
	if (type === "subscription_preapproval" && action === "updated") {
		try {
			const response = await axios.get("https://api.mercadopago.com/preapproval/search", {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				params: {
					id: data.id
				}
			});
			const subs = response.data.results?.[0];
			if (!subs) {
				console.log("❌ No se encontró la suscripción");
				return res.sendStatus(404);
			}
			if (subs.status !== "authorized") {
				console.log(`ℹ️ Suscripción con estado '${subs.status}', no se procesa aún.`);
				return res.sendStatus(200);
			}

			console.log("✅ Suscripción encontrada:", subs);

			await guardarSuscripcion(subs);
			await actualizarFirestoreTrasSuscripcion(subs)

			return res.sendStatus(200);
		} catch (err) {
			console.error("❌ Error al obtener suscripción:", err);
			return res.sendStatus(500);
		}
	}

	// Ignorar cualquier otro evento
	console.error("🚫 Tipo de evento no manejado:", type);
	res.sendStatus(200);

});


// Esta función la usás dentro de tu webhook cuando se aprueba una suscripción
async function guardarSuscripcion(preapprovalData) {
	try {
		const parsearReason = (reason) => {
			const partes = reason.split('-');
			const planId = partes[0].split('_')[0]
			const userId = partes[1].split('_')[1]
			const barberiaId = partes[2].split('_')[1]
			return { planId, userId, barberiaId };
		}

		const { planId, userId, barberiaId } = parsearReason(preapprovalData.reason);

		await admin.firestore().collection('suscripciones_activas').doc(userId).set({
			preapproval_id: preapprovalData.id,
			status: preapprovalData.status,
			ultima_aprobacion: preapprovalData.date_last_payment || preapprovalData.date_created,
			...(preapprovalData.payer_email ? { payer_email: preapprovalData.payer_email } : {}),
			planId,
			barberiaId,
		});

		console.log(`✅ Suscripción guardada para el usuario ${userId}`);
	} catch (err) {
		console.error('❌ Error al guardar suscripción en Firestore:', err);
	}
}


// Función para actualizar Firestore
const actualizarFirestoreTrasSuscripcion = async (preapprovalData) => {
	console.log('🔎 preapproval recibido:', JSON.stringify(preapprovalData, null, 2));
	const parsearReason = (reason) => {
		const partes = reason.split('-');
		const planId = partes[0].split('_')[0]
		const cortesPlan = parseInt(partes[0].split('_')[1])
		const userId = partes[1].split('_')[1]
		const nombreUsuario = partes[1].split('_')[2];
		const barberiaId = partes[2].split('_')[1]
		return { planId, cortesPlan, userId, nombreUsuario, barberiaId };
	}
	const { planId, cortesPlan, userId, nombreUsuario, barberiaId } = parsearReason(preapprovalData.reason);
	console.log(planId, cortesPlan, userId, nombreUsuario, barberiaId)

	const hoy = new Date();
	const unMesDespues = new Date();
	unMesDespues.setMonth(hoy.getMonth() + 1);

	const fechaInicio = hoy.toISOString();
	const fechaFin = unMesDespues.toISOString();


	try {
		// Actualizar barbería
		const barberiaRef = db.collection("barberias").doc(barberiaId);
		await barberiaRef.update({
			clientesActivos: FieldValue.arrayUnion({
				cortesRestantes: cortesPlan,
				fechaInicio,
				fechaFin,
				nombreUsuario,
				userId
			}),
		});


		// Actualizar usuario
		const usuarioRef = db.collection("usuarios").doc(userId);
		await usuarioRef.update({
			barberiaId,
			fechaInicioPlan: fechaInicio,
			fechaFinPlan: fechaFin,
			planActivo: true,
			planId,
		});

		console.log("✅ Firestore actualizado correctamente.");
	} catch (error) {
		console.error("❌ Error actualizando Firestore:", error.message);
	}
};


export default router;