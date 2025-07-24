import express from 'express';
import axios from 'axios';
const router = express.Router();
import { admin, db } from './firebase.js';
import { FieldValue } from 'firebase-admin/firestore';


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


// Webhook
router.post('/webhook', async (req, res) => {
  console.log('✅ Webhook FUNCIONA');
  console.log('Query:', req.query);
  console.log('Body:', req.body);
	console.log('🔔 Webhook recibida:', req.body);

	// Responder a Mercado Pago que recibiste el webhook (muy importante)
	res.status(200).send('OK');

	const { id, topic } = req.query;

	if (!id || !topic) {
		console.warn("⚠️ Webhook inválido, falta 'id' o 'topic'");
		return;
	}

	if (topic === 'preapproval') {
		try {
			const { data: preapproval } = await axios.get(
				`https://api.mercadopago.com/preapproval/${id}`,
				{
					headers: {
						Authorization: `Bearer ${process.env.ACCESS_TOKEN}`
					}
				}
			);

			await guardarSuscripcion(preapproval);

			await actualizarFirestoreTrasSuscripcion(preapproval)
		} catch (err) {
			console.error('❌ Error al obtener preapproval:', err);
		}
	}

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
			payer_email: preapprovalData.payer_email,
			planId,
			barberiaId
		});

		console.log(`✅ Suscripción guardada para el usuario ${userId}`);
	} catch (err) {
		console.error('❌ Error al guardar suscripción en Firestore:', err);
	}
}

export default router;