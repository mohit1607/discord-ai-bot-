require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const Groq = require('groq-sdk') // Use `import` only if using ES Modules or transpiler, else use require

// If you can't use ES modules, do this instead:
// const Groq = require('groq-sdk').default;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

async function getGroqChatCompletion(userMessage) {
    try {
        const chatCompletion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that answers questions politely and clearly.'
                },
                {
                    role: 'user',
                    content: userMessage,
                },
            ],
        });
        return chatCompletion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    } catch (error) {
        console.error('Groq API error:', error);
        return "Oops, something went wrong when contacting the AI.";
    }
}


client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user)) {
        const withoutMention = message.content.replace(/<@!?(\d+)>/g, '').trim();

        if (withoutMention.length === 0) {
            message.channel.send(`Hey ${message.author}, how can I help you?`);
        } else {
            // Call the Groq API with the user message and reply with AI response
            const aiResponse = await getGroqChatCompletion(withoutMention);
            message.channel.send(aiResponse);
        }
    }
});

client.login(process.env.TOKEN);
