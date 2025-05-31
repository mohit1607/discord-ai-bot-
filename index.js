require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const Groq = require('groq-sdk');
// const Filter = require('bad-words');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// const filter = new Filter();
const sessions = new Map(); // For storing conversation history per user

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// Function to get Groq response with conversation context
async function getGroqChatCompletion(userId, userMessage) {
    try {
        let history = sessions.get(userId) || [
            {
                role: 'system',
                content: 'You are a helpful assistant that answers questions politely and clearly.',
            }
        ];

        // Append the new message
        history.push({
            role: 'user',
            content: userMessage,
        });

        const chatCompletion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: history,
            max_tokens: 300
        });

        const aiReply = chatCompletion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";

        // Add assistant reply to history
        history.push({
            role: 'assistant',
            content: aiReply,
        });

        // Save the latest 10 exchanges to prevent memory bloat
        sessions.set(userId, history.slice(-10));

        return aiReply;
    } catch (error) {
        console.error('❌ Groq API error:', error);
        return "Oops, something went wrong when contacting the AI.";
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user)) {
        const withoutMention = message.content.replace(/<@!?(\d+)>/g, '').trim();

        if (withoutMention.length === 0) {
            return message.channel.send(`Hey ${message.author}, how can I help you?`);
        }

        // Check for profanity
        // if (filter.isProfane(withoutMention)) {
        //     return message.reply("🚫 Let's keep the conversation respectful, please.");
        // }

        const response = await getGroqChatCompletion(message.author.id, withoutMention);
        return message.channel.send(response);
    }
});

client.login(process.env.TOKEN);
