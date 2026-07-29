const express = require("express");
const axios = require("axios");
const respuestas = require("../data/respuestas.json");

const app = express();
app.use(express.json());

// ==== Variables de entorno (se configuran en Railway, no acá) ====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN; // lo inventas tú, ej: "milabot2026"
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // el token de acceso de Meta
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID; // el Phone Number ID de Meta

// Memoria simple en RAM para saber en qué "paso" está cada cliente
// (para producción real conviene una base de datos, pero para empezar esto sirve)
const estadoClientes = {};

// ===================================================
// 1) Verificación del webhook (Meta llama esto una sola vez al configurar)
// ===================================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado correctamente ✅");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ===================================================
// 2) Recepción de mensajes entrantes
// ===================================================
app.post("/webhook", async (req, res) => {
  // Respondemos rápido a Meta para que no reintente el envío
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const mensaje = value?.messages?.[0];

    if (!mensaje) return; // puede ser un evento de "status" (entregado/leído), lo ignoramos

    const numeroCliente = mensaje.from; // número del cliente que escribió
    const textoOriginal = mensaje.text?.body || "";
    const texto = textoOriginal.trim().toLowerCase();

    const respuesta = generarRespuesta(numeroCliente, texto);
    await enviarMensaje(numeroCliente, respuesta);
  } catch (err) {
    console.error("Error procesando mensaje:", err.message);
  }
});

// ===================================================
// Lógica de negocio: decide qué responder
// ===================================================
function generarRespuesta(numeroCliente, texto) {
  // Si el cliente escribe un saludo o es su primer mensaje, mandamos el menú
  const saludos = ["hola", "buenas", "buenos dias", "buenos días", "buenas tardes", "buenas noches", "menu", "menú"];
  if (saludos.includes(texto) || !estadoClientes[numeroCliente]) {
    estadoClientes[numeroCliente] = { ultimaInteraccion: Date.now() };
    return respuestas.bienvenida;
  }

  // Si el texto es exactamente un número del menú (1, 2, 3, 4)
  if (respuestas.menu[texto]) {
    return respuestas.menu[texto];
  }

  // Si el texto contiene alguna palabra clave conocida
  for (const palabra in respuestas.palabrasClave) {
    if (texto.includes(palabra)) {
      const opcion = respuestas.palabrasClave[palabra];
      return respuestas.menu[opcion];
    }
  }

  // Si no coincide con nada, mensaje de "no entendí"
  return respuestas.noEntendido;
}

// ===================================================
// Envío de mensajes usando la API de WhatsApp Cloud
// ===================================================
async function enviarMensaje(numeroDestino, texto) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: numeroDestino,
      type: "text",
      text: { body: texto },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// ===================================================
// Endpoint simple para verificar que el server está vivo
// ===================================================
app.get("/", (req, res) => {
  res.send("Bot de WhatsApp corriendo correctamente 🤖");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});