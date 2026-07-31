const { 
    Client: BotClient, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');

const { Client: SelfbotClient } = require('discord.js-selfbot-v13');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const ALLOWED_GUILDS = ['1493598034544820284', '1402276801065123942'];
const ADMIN_USER_ID = '1277163202614001706';
const CONFIG_FILE = path.join(__dirname, 'campaign_config.json');
const PROXIES_FILE = path.join(__dirname, 'proxies.json');

const controlBot = new BotClient({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let advState = {
    isRunning: false,
    sentCount: 0,
    failCount: 0,
    timeoutId: null,
    targetChannels: [],
    messageContent: '',
    minDelay: 0,
    maxDelay: 0,
    userToken: null,
    activeClient: null,
    currentProxy: null
};

function saveCampaignConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('Failed to save campaign config:', err);
    }
}

function loadCampaignConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Failed to load campaign config:', err);
    }
    return null;
}

function getProxyPool() {
    try {
        if (fs.existsSync(PROXIES_FILE)) {
            const data = fs.readFileSync(PROXIES_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Failed to load proxy pool:', err);
    }
    
    // Combined pool of all 20 proxies (10 previous + 10 new)
    const defaultProxies = [
        // Previous 10 proxies
        'vqvtbsll:delzv7dc3d6h@31.59.20.176:6754',
        'vqvtbsll:delzv7dc3d6h@31.56.127.193:7684',
        'vqvtbsll:delzv7dc3d6h@45.38.107.97:6014',
        'vqvtbsll:delzv7dc3d6h@198.105.121.200:6462',
        'vqvtbsll:delzv7dc3d6h@64.137.96.74:6641',
        'vqvtbsll:delzv7dc3d6h@198.23.243.226:6361',
        'vqvtbsll:delzv7dc3d6h@38.154.185.97:6370',
        'vqvtbsll:delzv7dc3d6h@84.247.60.125:6095',
        'vqvtbsll:delzv7dc3d6h@142.111.67.146:5611',
        'vqvtbsll:delzv7dc3d6h@191.96.254.138:6185',
        // New 10 proxies
        'jeifitnv:s1pibxrtd5hx@31.59.20.176:6754',
        'jeifitnv:s1pibxrtd5hx@31.56.127.193:7684',
        'jeifitnv:s1pibxrtd5hx@45.38.107.97:6014',
        'jeifitnv:s1pibxrtd5hx@198.105.121.200:6462',
        'jeifitnv:s1pibxrtd5hx@64.137.96.74:6641',
        'jeifitnv:s1pibxrtd5hx@198.23.243.226:6361',
        'jeifitnv:s1pibxrtd5hx@38.154.185.97:6370',
        'jeifitnv:s1pibxrtd5hx@84.247.60.125:6095',
        'jeifitnv:s1pibxrtd5hx@142.111.67.146:5611',
        'jeifitnv:s1pibxrtd5hx@191.96.254.138:6185'
    ];
    saveProxyPool(defaultProxies);
    return defaultProxies;
}

function saveProxyPool(proxies) {
    try {
        fs.writeFileSync(PROXIES_FILE, JSON.stringify(proxies, null, 2));
    } catch (err) {
        console.error('Failed to save proxy pool:', err);
    }
}

// Background RAM monitor updated to trigger at 950 MB
setInterval(() => {
    const memoryUsageMB = process.memoryUsage().rss / 1024 / 1024;
    if (memoryUsageMB >= 950) {
        console.log(`[Memory Guardian] RAM usage reached ${memoryUsageMB.toFixed(2)} MB. Restarting process safely...`);
        if (advState.activeClient) {
            try { advState.activeClient.destroy(); } catch {}
        }
        process.exit(0);
    }
}, 30000);

controlBot.once('ready', async () => {
    console.log(`Control Panel Bot logged in as ${controlBot.user.tag}`);

    // Clear saved config on startup so it never auto-resumes sessions
    if (fs.existsSync(CONFIG_FILE)) {
        try { 
            fs.unlinkSync(CONFIG_FILE); 
            console.log('[Startup] Cleared previous campaign configuration file. Fresh settings required.');
        } catch {}
    }

    const commands = [
        new SlashCommandBuilder()
            .setName('panel')
            .setDescription('Opens the hybrid advertising control panel'),
        new SlashCommandBuilder()
            .setName('adv')
            .setDescription('Manage advertisement automation')
            .addSubcommand(sub => 
                sub.setName('status').setDescription('Checks current status of advertisement loop')
            )
            .addSubcommand(sub => 
                sub.setName('stop').setDescription('Stops active advertising automation loop')
            ),
        new SlashCommandBuilder()
            .setName('admin_proxies')
            .setDescription('Manage the system proxy pool (Admin Only)')
            .addStringOption(option =>
                option.setName('action')
                    .setDescription('Action to execute')
                    .setRequired(true)
                    .addChoices(
                        { name: 'add', value: 'add' },
                        { name: 'remove', value: 'remove' },
                        { name: 'list', value: 'list' },
                        { name: 'clear', value: 'clear' }
                    )
            )
            .addStringOption(option =>
                option.setName('proxy')
                    .setDescription('Proxy string (Required for add/remove)')
                    .setRequired(false)
            )
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(controlBot.user.id), { body: commands });
        console.log('Successfully registered global slash commands.');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
});

function initializeAndRunSelfbot(token, proxyString, isResume = false) {
    if (advState.activeClient) {
        try { advState.activeClient.destroy(); } catch {}
        advState.activeClient = null;
    }

    let agentOptions = {};
    let formattedProxy = proxyString.trim();
    if (!formattedProxy.startsWith('http://') && !formattedProxy.startsWith('https://')) {
        formattedProxy = `http://${formattedProxy}`;
    }
    try {
        agentOptions.httpAgent = new HttpsProxyAgent(formattedProxy);
        agentOptions.ws = { agent: agentOptions.httpAgent };
        console.log(`[Proxy Engine] Assigned unique proxy to user session: ${proxyString.replace(/:([^:@]+)@/, ':****@')}`);
    } catch (e) {
        console.error('[Proxy Error] Failed to parse proxy configuration:', e.message);
    }

    const userClient = new SelfbotClient({ 
        checkUpdate: false,
        restTimeOffset: 0,
        failIfNotExists: false,
        ...agentOptions,
        ws: {
            ...(agentOptions.ws || {}),
            properties: {
                os: 'Windows',
                browser: 'Discord Client',
                device: 'desktop',
                system_locale: 'en-US',
                browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Discord/1.0.9015 Chrome/108.0.5359.215 Electron/22.3.14 Safari/537.36',
                browser_version: '1.0.9015',
                os_version: '10.0.19045',
                release_channel: 'stable',
                client_build_number: 175440
            }
        }
    });

    userClient.once('ready', async () => {
        advState.isRunning = true;
        advState.activeClient = userClient;
        if (!isResume) {
            advState.sentCount = 0;
            advState.failCount = 0;
        }

        console.log(`[Selfbot Engine] Successfully authenticated as ${userClient.user.tag} with dedicated proxy routing`);

        await new Promise(resolve => setTimeout(resolve, 8000));

        const initialDelaySecs = Math.floor(Math.random() * (advState.maxDelay - advState.minDelay + 1)) + advState.minDelay;

        const runLoop = async () => {
            if (!advState.isRunning || advState.activeClient !== userClient) return;

            if (advState.sentCount >= 35) {
                console.log('[Stability Cool-down] Pausing loop for 20 minutes to preserve socket health...');
                await new Promise(resolve => setTimeout(resolve, 20 * 60 * 1000));
                if (!advState.isRunning) return;
                advState.sentCount = 0;
            }

            for (const channelId of advState.targetChannels) {
                if (!advState.isRunning || advState.activeClient !== userClient) break;
                
                try {
                    const channel = await userClient.channels.fetch(channelId).catch(() => null);
                    if (!channel) {
                        advState.failCount++;
                        console.warn(`[Warning] Could not fetch channel ID: ${channelId}`);
                        continue;
                    }

                    const typingDuration = Math.min(Math.max(advState.messageContent.length * 110, 3500), 9000);
                    await channel.sendTyping().catch(() => {});
                    await new Promise(resolve => setTimeout(resolve, typingDuration));

                    const dynamicTokens = [' ', '  ', '\u200B', '\u200C', '\u200D', ' \u200B'];
                    const randomVariant = dynamicTokens[Math.floor(Math.random() * dynamicTokens.length)];
                    const finalPayload = advState.messageContent + randomVariant;

                    await channel.send(finalPayload);
                    advState.sentCount++;
                    
                    const currentCfg = loadCampaignConfig();
                    if (currentCfg) {
                        saveCampaignConfig({ ...currentCfg, sentCount: advState.sentCount, failCount: advState.failCount });
                    }
                } catch (err) {
                    advState.failCount++;
                    console.error(`[Execution Error] Channel ${channelId}:`, err.message);
                    
                    if (err.status === 429 || (err.message && err.message.toLowerCase().includes('rate limit'))) {
                        console.warn('[Rate Limit Guard] Rate limit hit. Enforcing 60-second backoff...');
                        await new Promise(resolve => setTimeout(resolve, 60000));
                    }
                }

                const channelBuffer = Math.floor(Math.random() * 6000) + 6000;
                await new Promise(resolve => setTimeout(resolve, channelBuffer));
            }

            if (advState.isRunning && advState.activeClient === userClient) {
                const randomDelaySecs = Math.floor(Math.random() * (advState.maxDelay - advState.minDelay + 1)) + advState.minDelay;
                advState.timeoutId = setTimeout(runLoop, randomDelaySecs * 1000);
            }
        };

        advState.timeoutId = setTimeout(runLoop, initialDelaySecs * 1000);
    });

    userClient.on('error', (err) => {
        console.error('[Selfbot Gateway Error]:', err.message);
    });

    userClient.login(token).catch((err) => {
        console.error(`[Login Critical Error] Failed to authenticate user token: ${err.message}`);
        stopAutomation();
    });
}

controlBot.on('interactionCreate', async interaction => {
    try {
        if (!interaction.guildId || !ALLOWED_GUILDS.includes(interaction.guildId)) {
            if (interaction.isRepliable()) {
                return interaction.reply({ content: '❌ This bot is not authorized to be used in this server.', ephemeral: true });
            }
            return;
        }

        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'admin_proxies') {
                if (interaction.user.id !== ADMIN_USER_ID) {
                    return interaction.reply({ content: '❌ You do not have permission to use this administrative command.', ephemeral: true });
                }

                const action = interaction.options.getString('action');
                const proxyInput = interaction.options.getString('proxy');
                let pool = getProxyPool();

                if (action === 'list') {
                    const listText = pool.length > 0 ? pool.map((p, i) => `\`${i + 1}.\` ${p.replace(/:([^:@]+)@/, ':****@')}`).join('\n') : 'Proxy pool is empty.';
                    const embed = new EmbedBuilder()
                        .setTitle('📋 Current Proxy Pool')
                        .setDescription(listText)
                        .setColor(0x5865F2)
                        .setFooter({ text: `Total Available Free Proxies: ${pool.length}` })
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }

                if (action === 'clear') {
                    saveProxyPool([]);
                    return interaction.reply({ content: '🧹 Proxy pool has been completely cleared.', ephemeral: true });
                }

                if (!proxyInput) {
                    return interaction.reply({ content: '❌ You must specify a proxy value for `add` or `remove` actions.', ephemeral: true });
                }

                const cleanedProxy = proxyInput.trim();

                if (action === 'add') {
                    if (pool.includes(cleanedProxy)) {
                        return interaction.reply({ content: `⚠️ Proxy \`${cleanedProxy.replace(/:([^:@]+)@/, ':****@')}\` already exists in the pool.`, ephemeral: true });
                    }
                    pool.push(cleanedProxy);
                    saveProxyPool(pool);
                    return interaction.reply({ content: `✅ Successfully added proxy \`${cleanedProxy.replace(/:([^:@]+)@/, ':****@')}\` to the pool. Total pool size: **${pool.length}**`, ephemeral: true });
                }

                if (action === 'remove') {
                    const index = pool.indexOf(cleanedProxy);
                    if (index === -1) {
                        return interaction.reply({ content: `❌ Proxy \`${cleanedProxy.replace(/:([^:@]+)@/, ':****@')}\` was not found in the pool.`, ephemeral: true });
                    }
                    pool.splice(index, 1);
                    saveProxyPool(pool);
                    return interaction.reply({ content: `🗑️ Successfully removed proxy \`${cleanedProxy.replace(/:([^:@]+)@/, ':****@')}\` from the pool. Remaining pool size: **${pool.length}**`, ephemeral: true });
                }
            }
            else if (interaction.commandName === 'panel') {
                const embed = new EmbedBuilder()
                    .setTitle('🚀 Elite Broadcast Automation Suite')
                    .setDescription('Welcome to the enterprise-grade automated broadcasting dashboard. Launch and manage your continuous engagement campaigns securely and efficiently.\n\n**💡 Management Commands:**\n• Use `/adv status` to check your running campaign metrics.\n• Use `/adv stop` to safely terminate an active broadcast loop.')
                    .setColor(0x5865F2)
                    .addFields({ name: 'System Integrity', value: 'Ensure proper configurations are set to maintain continuous, uninterrupted service.', inline: false })
                    .setFooter({ text: 'Broadcast Control Panel' })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_adv_modal')
                        .setLabel('Start Advertising')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🚀')
                );

                await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            } 
            else if (interaction.commandName === 'adv') {
                const sub = interaction.options.getSubcommand();
                if (sub === 'status') {
                    const statusEmbed = new EmbedBuilder()
                        .setTitle('📊 Advertisement Status Report')
                        .addFields(
                            { name: 'Status', value: advState.isRunning ? '🟢 Running' : '🔴 Stopped', inline: true },
                            { name: 'Messages Sent', value: `${advState.sentCount}`, inline: true },
                            { name: 'Failed Attempts', value: `${advState.failCount}`, inline: true },
                            { name: 'Delay Range', value: `${advState.minDelay}s - ${advState.maxDelay}s`, inline: false }
                        )
                        .setColor(advState.isRunning ? 0x57F287 : 0xED4245)
                        .setTimestamp();

                    await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
                } 
                else if (sub === 'stop') {
                    if (!advState.isRunning) {
                        return interaction.reply({ content: '⚠️ Advertising automation is not currently running.', ephemeral: true });
                    }
                    stopAutomation();
                    await interaction.reply({ content: '🛑 Advertising automation has been successfully terminated.', ephemeral: true });
                }
            }
        }
        else if (interaction.isButton() && interaction.customId === 'open_adv_modal') {
            const modal = new ModalBuilder()
                .setCustomId('adv_config_modal')
                .setTitle('Configure Campaign');

            const tokenInput = new TextInputBuilder()
                .setCustomId('adv_token')
                .setLabel('Discord User Token')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Paste user token here...')
                .setRequired(true);

            const channelsInput = new TextInputBuilder()
                .setCustomId('adv_channels')
                .setLabel('Channel IDs (Comma separated)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('123456789012345678, 876543210987654321')
                .setRequired(true);

            const messageInput = new TextInputBuilder()
                .setCustomId('adv_message')
                .setLabel('Advertisement Message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Type your advertisement message here...')
                .setRequired(true);

            const delayInput = new TextInputBuilder()
                .setCustomId('adv_delay')
                .setLabel('Delay Range (Min-Max Seconds, e.g. 90-180)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('90-180')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(tokenInput),
                new ActionRowBuilder().addComponents(channelsInput),
                new ActionRowBuilder().addComponents(messageInput),
                new ActionRowBuilder().addComponents(delayInput)
            );

            await interaction.showModal(modal);
        }
        else if (interaction.isModalSubmit() && interaction.customId === 'adv_config_modal') {
            if (advState.isRunning) {
                return interaction.reply({ content: '⚠️ An advertising process is already active. Stop it first using `/adv stop`.', ephemeral: true });
            }

            const pool = getProxyPool();
            if (pool.length === 0) {
                return interaction.reply({ 
                    content: '❌ **Resource Pool Exhausted!** Campaign blocked because no resources are available. Contact an administrator.', 
                    ephemeral: true 
                });
            }

            const token = interaction.fields.getTextInputValue('adv_token').trim().replace(/^["'](.+)["']$/, '$1');
            const channelsRaw = interaction.fields.getTextInputValue('adv_channels');
            const messageContent = interaction.fields.getTextInputValue('adv_message');
            const delayRaw = interaction.fields.getTextInputValue('adv_delay').trim();

            let min = 90, max = 180;
            if (delayRaw.includes('-')) {
                const parts = delayRaw.split('-').map(p => parseInt(p.trim(), 10));
                if (!isNaN(parts[0]) && !isNaN(parts[1])) {
                    min = parts[0];
                    max = parts[1];
                }
            } else {
                const val = parseInt(delayRaw, 10);
                if (!isNaN(val)) min = max = val;
            }

            if (min < 60 || max < min) {
                return interaction.reply({ content: '❌ Minimum delay must be at least 60 seconds.', ephemeral: true });
            }

            const channels = channelsRaw.split(',').map(id => id.trim()).filter(id => id.length > 0);
            if (channels.length === 0) {
                return interaction.reply({ content: '❌ No valid channel IDs provided.', ephemeral: true });
            }

            const assignedProxy = pool.shift();
            saveProxyPool(pool); 

            await interaction.deferReply({ ephemeral: true });

            advState.targetChannels = channels;
            advState.messageContent = messageContent;
            advState.minDelay = min;
            advState.maxDelay = max;
            advState.userToken = token;
            advState.currentProxy = assignedProxy;

            saveCampaignConfig({
                isRunning: true,
                targetChannels: channels,
                messageContent: messageContent,
                minDelay: min,
                maxDelay: max,
                userToken: token,
                currentProxy: assignedProxy,
                sentCount: 0,
                failCount: 0
            });

            initializeAndRunSelfbot(token, assignedProxy, false);

            await interaction.editReply({ 
                content: `🚀 **Campaign Initialized Safely!**\nTargeting **${channels.length} channel(s)**.` 
            });
        }
    } catch (error) {
        console.error('Interaction error:', error);
        if (interaction.isRepliable() && !interaction.replied) {
            await interaction.reply({ content: 'An unexpected error occurred.', ephemeral: true }).catch(() => {});
        }
    }
});

function stopAutomation() {
    if (advState.currentProxy) {
        const pool = getProxyPool();
        if (!pool.includes(advState.currentProxy)) {
            pool.push(advState.currentProxy);
            saveProxyPool(pool);
        }
    }

    advState.isRunning = false;
    if (advState.timeoutId) {
        clearTimeout(advState.timeoutId);
        advState.timeoutId = null;
    }
    if (advState.activeClient) {
        try {
            advState.activeClient.destroy();
        } catch {}
        advState.activeClient = null;
    }
    advState.userToken = null;
    advState.currentProxy = null;

    if (fs.existsSync(CONFIG_FILE)) {
        try { fs.unlinkSync(CONFIG_FILE); } catch {}
    }
}

controlBot.login(process.env.DISCORD_TOKEN);
