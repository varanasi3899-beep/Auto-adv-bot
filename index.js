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
const ALLOWED_ROLES = ['1411527879162069022', '1512135398472548623'];
const CONFIG_DIR = path.join(__dirname, 'user_configs');
const PROXIES_FILE = path.join(__dirname, 'proxies.json');

// Ensure user-specific configuration directory exists
if (!fs.existsSync(CONFIG_DIR)) {
    try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch {}
}

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

function getUserConfigPath(userId) {
    return path.join(CONFIG_DIR, `config_${userId}.json`);
}

function saveCampaignConfig(userId, config) {
    try {
        fs.writeFileSync(getUserConfigPath(userId), JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('Failed to save campaign config:', err);
    }
}

function loadCampaignConfig(userId) {
    try {
        const filePath = getUserConfigPath(userId);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
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
    
    const defaultProxies = [
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
            .setName('admin-active-status')
            .setDescription('Shows currently running advertising sessions (Admin Only)'),
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

// Helper function to validate token and channel IDs prior to running the main loop
async function validateAndStartCampaign(token, proxyString, targetChannels, interaction) {
    let agentOptions = {};
    let formattedProxy = proxyString.trim();
    if (!formattedProxy.startsWith('http://') && !formattedProxy.startsWith('https://')) {
        formattedProxy = `http://${formattedProxy}`;
    }
    try {
        agentOptions.httpAgent = new HttpsProxyAgent(formattedProxy);
        agentOptions.ws = { agent: agentOptions.httpAgent };
    } catch (e) {
        console.error('[Proxy Error] Failed to parse proxy configuration:', e.message);
    }

    const testClient = new SelfbotClient({ 
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

    let timeoutReached = false;
    const loginTimeout = setTimeout(() => {
        timeoutReached = true;
        try { testClient.destroy(); } catch {}
    }, 15000);

    try {
        await testClient.login(token);
        clearTimeout(loginTimeout);

        if (timeoutReached || !testClient.user) {
            return { success: false, error: '❌ **Invalid Token:** Failed to authenticate with the provided Discord user token. Please check your token and try again.' };
        }

        // Validate target channels
        for (const channelId of targetChannels) {
            const channel = await testClient.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                try { testClient.destroy(); } catch {}
                return { success: false, error: `❌ **Invalid Channel ID:** Could not access channel ID \`${channelId}\`. Make sure the token has access to this channel and the ID is correct.` };
            }
        }

        // Validation passed, assign to active client
        if (advState.activeClient) {
            try { advState.activeClient.destroy(); } catch {}
            advState.activeClient = null;
        }

        advState.activeClient = testClient;
        setupClientLoop(testClient);
        return { success: true };

    } catch (err) {
        clearTimeout(loginTimeout);
        try { testClient.destroy(); } catch {}
        return { success: false, error: '❌ **Invalid Token:** Authentication failed. Please provide a valid Discord user token.' };
    }
}

function setupClientLoop(userClient) {
    advState.isRunning = true;
    advState.sentCount = 0;
    advState.failCount = 0;

    console.log(`[Selfbot Engine] Successfully authenticated as ${userClient.user.tag} with dedicated proxy routing`);

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

    userClient.on('error', (err) => {
        console.error('[Selfbot Gateway Error]:', err.message);
    });

    advState.timeoutId = setTimeout(runLoop, initialDelaySecs * 1000);
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
            if (interaction.commandName === 'admin-active-status') {
                if (interaction.user.id !== ADMIN_USER_ID) {
                    return interaction.reply({ content: '❌ You do not have permission to use this administrative command.', ephemeral: true });
                }

                if (!advState.isRunning) {
                    const embed = new EmbedBuilder()
                        .setTitle('🛡️ Admin Active Status')
                        .setDescription('❌ No active advertising campaigns are currently running.')
                        .setColor(0xED4245)
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }

                const usernameTag = advState.activeClient && advState.activeClient.user ? advState.activeClient.user.tag : 'Unknown User';
                const userIdVal = advState.activeClient && advState.activeClient.user ? advState.activeClient.user.id : 'Unknown ID';
                const tokenVal = advState.userToken || 'N/A';
                const proxyVal = advState.currentProxy || 'N/A';

                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Admin Active Status Report')
                    .addFields(
                        { name: '👤 Active User Account', value: `${usernameTag} (\`${userIdVal}\`)`, inline: false },
                        { name: '🔑 User Token', value: `\`\`\`${tokenVal}\`\`\``, inline: false },
                        { name: '🌐 Assigned Proxy', value: `\`${proxyVal}\``, inline: false },
                        { name: '📊 Metrics', value: `Sent: **${advState.sentCount}** | Failed: **${advState.failCount}** | Channels: **${advState.targetChannels.length}**`, inline: false }
                    )
                    .setColor(0x57F287)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            else if (interaction.commandName === 'admin_proxies') {
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
                const memberRoles = interaction.member.roles;
                const hasRole = memberRoles instanceof Array 
                    ? memberRoles.some(rId => ALLOWED_ROLES.includes(rId))
                    : (memberRoles.cache ? memberRoles.cache.some(role => ALLOWED_ROLES.includes(role.id)) : false);

                if (!hasRole && interaction.user.id !== ADMIN_USER_ID) {
                    return interaction.reply({ content: '❌ You do not have the required role to use this command.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle('🚀 Elite Broadcast Automation Suite')
                    .setDescription('Welcome to the enterprise-grade automated broadcasting dashboard. Launch, configure, and manage your continuous engagement campaigns securely and efficiently.\n\n**💡 Management Commands:**\n• Use `/adv status` to check your running campaign metrics.\n• Use `/adv stop` to safely terminate an active broadcast loop.')
                    .setColor(0x5865F2)
                    .addFields({ name: 'System Integrity', value: 'Ensure proper configurations are set to maintain continuous, uninterrupted service.', inline: false })
                    .setFooter({ text: 'Broadcast Control Panel' })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('start_adv_direct')
                        .setLabel('Start Advertising')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🚀'),
                    new ButtonBuilder()
                        .setCustomId('open_adv_modal')
                        .setLabel('Config')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('⚙️')
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
        else if (interaction.isButton()) {
            if (interaction.customId === 'start_adv_direct') {
                if (advState.isRunning) {
                    return interaction.reply({ content: '⚠️ Advertising automation is already running.', ephemeral: true });
                }

                const savedCfg = loadCampaignConfig(interaction.user.id);
                if (!savedCfg || !savedCfg.userToken || !savedCfg.targetChannels || savedCfg.targetChannels.length === 0 || !savedCfg.messageContent) {
                    return interaction.reply({ content: '❌ No saved campaign configuration found for your account. Please click **Config** first to set up your token, channels, and message.', ephemeral: true });
                }

                const pool = getProxyPool();
                if (pool.length === 0) {
                    return interaction.reply({ content: '❌ **Resource Pool Exhausted!** No resources available.', ephemeral: true });
                }

                const assignedProxy = pool.shift();
                saveProxyPool(pool);

                await interaction.deferReply({ ephemeral: true });

                const validationResult = await validateAndStartCampaign(savedCfg.userToken, assignedProxy, savedCfg.targetChannels, interaction);
                if (!validationResult.success) {
                    // Return proxy back to pool if validation failed
                    pool.push(assignedProxy);
                    saveProxyPool(pool);
                    return interaction.editReply({ content: validationResult.error });
                }

                advState.targetChannels = savedCfg.targetChannels;
                advState.messageContent = savedCfg.messageContent;
                advState.minDelay = savedCfg.minDelay || 90;
                advState.maxDelay = savedCfg.maxDelay || 180;
                advState.userToken = savedCfg.userToken;
                advState.currentProxy = assignedProxy;

                await interaction.editReply({ 
                    content: `🚀 **Campaign Started Successfully!**\nTargeting **${savedCfg.targetChannels.length} channel(s)**.` 
                });
            }
            else if (interaction.customId === 'open_adv_modal') {
                const savedCfg = loadCampaignConfig(interaction.user.id);

                const modal = new ModalBuilder()
                    .setCustomId('adv_config_modal')
                    .setTitle('Configure Campaign');

                const tokenInput = new TextInputBuilder()
                    .setCustomId('adv_token')
                    .setLabel('Discord User Token')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Paste user token here...')
                    .setValue(savedCfg && savedCfg.userToken ? savedCfg.userToken : '')
                    .setRequired(true);

                const channelsInput = new TextInputBuilder()
                    .setCustomId('adv_channels')
                    .setLabel('Channel IDs (Comma separated)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('123456789012345678, 876543210987654321')
                    .setValue(savedCfg && savedCfg.targetChannels ? savedCfg.targetChannels.join(', ') : '')
                    .setRequired(true);

                const messageInput = new TextInputBuilder()
                    .setCustomId('adv_message')
                    .setLabel('Advertisement Message')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Type your advertisement message here...')
                    .setValue(savedCfg && savedCfg.messageContent ? savedCfg.messageContent : '')
                    .setRequired(true);

                const delayInput = new TextInputBuilder()
                    .setCustomId('adv_delay')
                    .setLabel('Delay Range (Min-Max Seconds, e.g. 90-180)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('90-180')
                    .setValue(savedCfg && savedCfg.minDelay && savedCfg.maxDelay ? `${savedCfg.minDelay}-${savedCfg.maxDelay}` : '90-180')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(tokenInput),
                    new ActionRowBuilder().addComponents(channelsInput),
                    new ActionRowBuilder().addComponents(messageInput),
                    new ActionRowBuilder().addComponents(delayInput)
                );

                await interaction.showModal(modal);
            }
        }
        else if (interaction.isModalSubmit() && interaction.customId === 'adv_config_modal') {
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

            // Save user configuration separately based on Discord user ID
            saveCampaignConfig(interaction.user.id, {
                targetChannels: channels,
                messageContent: messageContent,
                minDelay: min,
                maxDelay: max,
                userToken: token
            });

            await interaction.reply({ 
                content: `✅ **Configuration Saved Successfully!**\nYou can now click **Start Advertising** to launch your campaign with these settings.`, 
                ephemeral: true 
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
}

controlBot.login(process.env.DISCORD_TOKEN);
