require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const Groq = require('groq-sdk');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: ['CHANNEL'], // Needed to receive DMs
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const sessions = new Map(); // Stores per-user-per-channel sessions
const sessionTimers = new Map(); // Stores timeout timers for sessions

// Array of authorized user IDs - add multiple user IDs here
const AUTHORIZED_USER_IDS = ['717225160255602699', 'ANOTHER_USER_ID_HERE']; // Fallback array

const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

async function getGroqChatCompletion(sessionKey, userMessage) {
    try {
        let history = sessions.get(sessionKey) || [
            {
                role: 'system',
                content: 'You are a helpful assistant that answers questions politely and clearly.',
            }
        ];

        history.push({ role: 'user', content: userMessage });

        const chatCompletion = await groq.chat.completions.create({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: history,
            max_tokens: 300
        });

        const aiReply = chatCompletion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";

        history.push({ role: 'assistant', content: aiReply });
        sessions.set(sessionKey, history.slice(-10)); // Keep latest 10 messages

        // Reset the session timeout
        resetSessionTimeout(sessionKey);

        return aiReply;
    } catch (error) {
        console.error('❌ Groq API error:', error);
        return "Oops, something went wrong when contacting the AI.";
    }
}

function resetSessionTimeout(sessionKey) {
    // Clear existing timeout if any
    if (sessionTimers.has(sessionKey)) {
        clearTimeout(sessionTimers.get(sessionKey));
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
        if (sessions.has(sessionKey)) {
            sessions.delete(sessionKey);
            sessionTimers.delete(sessionKey);
            console.log(`🕐 Session ${sessionKey} auto-expired after 5 minutes of inactivity`);
        }
    }, SESSION_TIMEOUT);

    sessionTimers.set(sessionKey, timeoutId);
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Check if the user is authorized to use the bot
    if (!AUTHORIZED_USER_IDS.includes(message.author.id)) {
        return; // Silently ignore messages from unauthorized users
    }

    const isDM = message.channel.type === ChannelType.DM;
    const userId = message.author.id;
    const channelId = message.channel.id;
    const sessionKey = `${userId}-${channelId}`;
    const content = message.content.trim();
    const lower = content.toLowerCase();
    const stopPattern = /\b(stop|quit|cancel|end|exit|bye|terminate|shut\s*up)\b/i;

    // If the bot is mentioned — start a session AND process the message
    if (isDM || message.mentions.has(client.user)) {
        // Initialize session if it doesn't exist
        if (!sessions.has(sessionKey)) {
            sessions.set(sessionKey, [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that answers questions politely and clearly.',
                }
            ]);
        }

        // Clean the message content by removing the mention
        let cleanContent = content;
        if (!isDM) {
            // Remove the bot mention from the message
            cleanContent = content.replace(`<@${client.user.id}>`, '').trim();
            // Also handle nickname mentions
            cleanContent = cleanContent.replace(`<@!${client.user.id}>`, '').trim();
        }

        // If there's actual content after the mention, process it
        if (cleanContent) {
            const response = await getGroqChatCompletion(sessionKey, cleanContent);
            return message.channel.send(
                `${isDM ? '' : `<@${userId}> `}${response}\n\n💡 You can type "stop", "quit", or similar to end this chat. Session auto-expires after 5 minutes of inactivity.`
            );
        } else {
            // If it's just a mention with no content, send the welcome message and start timeout
            resetSessionTimeout(sessionKey);
            return message.channel.send(
                `${isDM ? '' : `<@${userId}> `}👋 Session started! You can now chat with me.\nType "stop", "quit", or similar to end the session. Session will auto-expire after 5 minutes of inactivity.`
            );
        }
    }

    // Continue the session if one exists
    if (sessions.has(sessionKey)) {
        if (stopPattern.test(lower)) {
            sessions.delete(sessionKey);
            // Clear the timeout timer
            if (sessionTimers.has(sessionKey)) {
                clearTimeout(sessionTimers.get(sessionKey));
                sessionTimers.delete(sessionKey);
            }
            return message.channel.send(`${isDM ? '' : `<@${userId}> `}🛑 Session ended. Mention me again to start a new one.`);
        }

        const response = await getGroqChatCompletion(sessionKey, content);
        return message.channel.send(
            `${isDM ? '' : `<@${userId}> `}${response}\n\n💡 You can type "stop", "quit", or similar to end this chat. Session auto-expires after 5 minutes of inactivity.`
        );
    }

    // Ignore messages if session is not started
});

client.login(process.env.TOKEN);