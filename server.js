import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import cors from 'cors';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

app.post('/api/message', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ error: 'Falta el mensaje del usuario' });
  }

  try {
    // 1. Crear thread
    const threadRes = await axios.post(
      'https://api.openai.com/v1/threads',
      {},
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json',
        },
      }
    );

    const threadId = threadRes.data.id;

    // 2. Añadir mensaje del usuario al thread
    await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        role: 'user',
        content: userMessage,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json',
        },
      }
    );

    // 3. Lanzar run con el assistant_id
    const runRes = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      {
        assistant_id: ASSISTANT_ID,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json',
        },
      }
    );

    const runId = runRes.data.id;

    // 4. Esperar a que termine el run
    let runStatus = 'queued';
    let attempts = 0;
    while (runStatus !== 'completed' && attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const statusRes = await axios.get(
        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v2',
          },
        }
      );
      runStatus = statusRes.data.status;
      if (runStatus === 'failed' || runStatus === 'cancelled') {
        throw new Error(`Run fallido con estado: ${runStatus}`);
      }
      attempts++;
    }

    if (runStatus !== 'completed') {
      return res.status(500).json({ error: 'El asistente no respondió a tiempo.' });
    }

    // 5. Obtener mensaje del assistant
    const messagesRes = await axios.get(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      }
    );

    const assistantReply = messagesRes.data.data.find(
      (msg) => msg.role === 'assistant'
    )?.content?.[0]?.text?.value;

    res.json({ reply: assistantReply || '❓ Sin respuesta del asistente.' });
  } catch (error) {
    console.error('Error al procesar el mensaje:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Error interno al procesar el mensaje.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});

