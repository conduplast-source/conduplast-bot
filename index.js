const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const conversaciones = {};

const SYSTEM_PROMPT = `Sos el asistente de ventas de Conduplast, una fábrica argentina de cables. Tu trabajo es atender consultas de clientes por WhatsApp, recolectar la información necesaria y ayudar a concretar pedidos o cotizaciones.

PRODUCTOS QUE FABRICAMOS:
- Cables de señal
- Cables de datos
- Cables para celda de carga
- Cables personalizados (colores de vaina por cantidad mínima)

OPCIONES DE BLINDAJE:
- Sin blindaje
- Blindaje simple: pantalla de aluminio + cuerda de descarga de cobre estañado
- Blindaje completo: pantalla de aluminio + malla de cobre estañado trenzada

INFORMACIÓN QUE NECESITÁS RECOLECTAR (de a una cosa por vez):
1. Tipo de cable que necesita
2. Cantidad de conductores/pares y sección en mm²
3. Si necesita blindaje y qué tipo
4. Si necesita vaina de color personalizado (requiere cantidad mínima)
5. Metros necesarios
6. Para cuándo lo necesita
7. Si retira en fábrica o necesita envío y a dónde
8. Forma de pago (efectivo, transferencia, cuenta corriente)
9. Nombre, empresa y CUIT del cliente

REGLAS:
- Respondé en español argentino, amable y profesional
- Preguntá de a UNA cosa por vez
- Si el cliente da mucha info junta, procesala y preguntá solo lo que falta
- Cuando tengas TODA la info, hacé un resumen del pedido y preguntá si está correcto
- Si preguntan por precios, deciles que con todos los datos les pasás la cotización completa
- Nunca inventes precios ni plazos — cuando tengas los datos decí que confirman en breve
- Cuando el pedido esté completo y confirmado, terminá con: [PEDIDO_COMPLETO]`;

async function obtenerRespuestaIA(numeroCliente, mensajeCliente) {
  if (!conversaciones[numeroCliente]) {
    conversaciones[numeroCliente] = [];
  }

  conversaciones[numeroCliente].push({ role: 'user', content: mensajeCliente });

  if (conversaciones[numeroCliente].length > 20) {
    conversaciones[numeroCliente] = conversaciones[numeroCliente].slice(-20);
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: conversaciones[numeroCliente]
    });

    const respuesta = response.content[0].text;
    conversaciones[numeroCliente].push({ role: 'assistant', content: respuesta });
    return respuesta;
  } catch (error) {
    console.error('Error con Claude API:', error);
    return 'Disculpá, tuve un problema técnico. Por favor escribinos de nuevo en unos minutos.';
  }
}

app.post('/webhook', async (req, res) => {
  const mensajeEntrante = req.body.Body;
  const numeroCliente = req.body.From;

  console.log(`Mensaje de ${numeroCliente}: ${mensajeEntrante}`);

  try {
    const respuestaIA = await obtenerRespuestaIA(numeroCliente, mensajeEntrante);
    const mensajeVisible = respuestaIA.replace('[PEDIDO_COMPLETO]', '').trim();

    await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_NUMBER}`,
      to: numeroCliente,
      body: mensajeVisible
    });

    console.log(`Respuesta enviada a ${numeroCliente}`);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error');
  }
});

app.get('/', (req, res) => {
  res.send('Conduplast Bot funcionando');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});
