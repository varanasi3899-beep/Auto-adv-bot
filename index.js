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
const RESTRICTED_FILE = path.join(__dirname, 'restricted_users.json');
const PERSISTENT_ACTIVE_USERS_FILE = path.join(__dirname, 'persistent_active_users.json');

// Ensure user-specific configuration directory exists
if (!fs.existsSync(CONFIG_DIR)) {
    try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch {}
}

const controlBot = new BotClient({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages]
});

// Active user sessions map (Key: userId, Value: session object)
const activeSessions = new Map();

function getRestrictedUsers() {
    try {
        if (fs.existsSync(RESTRICTED_FILE)) {
            const data = fs.readFileSync(RESTRICTED_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Failed to load restricted users:', err);
    }
    return [];
}

function saveRestrictedUsers(restrictedList) {
    try {
        fs.writeFileSync(RESTRICTED_FILE, JSON.stringify(restrictedList, null, 2));
    } catch (err) {
        console.error('Failed to save restricted users:', err);
    }
}

function getPersistentActiveUsers() {
    try {
        if (fs.existsSync(PERSISTENT_ACTIVE_USERS_FILE)) {
            const data = fs.readFileSync(PERSISTENT_ACTIVE_USERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Failed to load persistent active users:', err);
    }
    return [];
}

function savePersistentActiveUsers(usersList) {
    try {
        fs.writeFileSync(PERSISTENT_ACTIVE_USERS_FILE, JSON.stringify(usersList, null, 2));
    } catch (err) {
        console.error('Failed to save persistent active users:', err);
    }
}

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
        for (const [userId, session] of activeSessions.entries()) {
            if (session.activeClient) {
                try { session.activeClient.destroy(); } catch {}
            }
        }
        process.exit(0);
    }
}, 30000);

controlBot.once('ready', async () => {
    console.log(`Control Panel Bot logged in as ${controlBot.user.tag}`);

    // Check for users whose ads were active before redeployment/rehosting
    const previousActiveUsers = getPersistentActiveUsers();
    if (previousActiveUsers.length > 0) {
        console.log(`[Deployment Notifier] Found ${previousActiveUsers.length} previously active users. Sending deployment update DMs...`);
        for (const userId of previousActiveUsers) {
            try {
                const user = await controlBot.users.fetch(userId).catch(() => null);
                if (user) {
                    const embed = new EmbedBuilder()
                        .setTitle('🔄 Bot Redeployed / Updated')
                        .setDescription('Hello! The advertising automation bot has just been redeployed and updated with fresh improvements and changes.\n\nYour active advertising campaign was interrupted by this restart. Please open your control panel and restart your ads to resume broadcasting.')
                        .setColor(0xFEE75C)
                        .setTimestamp();

                    await user.send({ embeds: [embed] }).catch(() => {});
                }
            } catch (err) {
                console.error(`Failed to DM user ${userId}:`, err.message);
            }
        }
        // Clear persistent list after notifying so it doesn't spam on normal small events unless intended
        savePersistentActiveUsers([]);
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
            .setName('admin-active-status')
            .setDescription('Shows currently running advertising sessions (Admin Only)'),
        new SlashCommandBuilder()
            .setName('admin-session-stop')
            .setDescription('Manage user advertising sessions and restrictions (Admin Only)'),
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

async function validateAndStartCampaign(userId, token, proxyString, targetChannels) {
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

        // Clean up previous user session if exists
        if (activeSessions.has(userId)) {
            const existing = activeSessions.get(userId);
            if (existing.activeClient) {
                try { existing.activeClient.destroy(); } catch {}
            }
            if (existing.currentProxy) {
                const pool = getProxyPool();
                if (!pool.includes(existing.currentProxy)) {
                    pool.push(existing.currentProxy);
                    saveProxyPool(pool);
                }
            }
        }

        const session = {
            isRunning: true,
            sentCount: 0,
            failCount: 0,
            timeoutId: null,
            targetChannels,
            messageContent: '',
            minDelay: 90,
            maxDelay: 180,
            userToken: token,
            activeClient: testClient,
            currentProxy: proxyString
        };

        activeSessions.set(userId, session);

        // Track persistent active users for redeployment alerts
        const currentActiveList = getPersistentActiveUsers();
        if (!currentActiveList.includes(userId)) {
            currentActiveList.push(userId);
            savePersistentActiveUsers(currentActiveList);
        }

        return { success: true, session };

    } catch (err) {
        clearTimeout(loginTimeout);
        try { testClient.destroy(); } catch {}
        return { success: false, error: '❌ **Invalid Token:** Authentication failed. Please provide a valid Discord user token.' };
    }
}

function setupClientLoop(userId, session) {
    const userClient = session.activeClient;
    console.log(`[Selfbot Engine] Successfully authenticated as ${userClient.user.tag} with dedicated proxy routing`);

    const initialDelaySecs = Math.floor(Math.random() * (session.maxDelay - session.minDelay + 1)) + session.minDelay;

    const runLoop = async () => {
        if (!session.isRunning || session.activeClient !== userClient) return;

        if (session.sentCount >= 35) {
            console.log('[Stability Cool-down] Pausing loop for 5 minutes to preserve socket health...');
            await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
            if (!session.isRunning) return;
            session.sentCount = 0;
        }

        for (const channelId of session.targetChannels) {
            if (!session.isRunning || session.activeClient !== userClient) break;
            
            try {
                const channel = await userClient.channels.fetch(channelId).catch(() => null);
                if (!channel) {
                    session.failCount++;
                    console.warn(`[Warning] Could not fetch channel ID: ${channelId}`);
                    continue;
                }

                const typingDuration = Math.min(Math.max(session.messageContent.length * 110, 3500), 9000);
                await channel.sendTyping().catch(() => {});
                await new Promise(resolve => setTimeout(resolve, typingDuration));

                const dynamicTokens = [' ', '  ', '\u200B', '\u200C', '\u200D', ' \u200B'];
                const randomVariant = dynamicTokens[Math.floor(Math.random() * dynamicTokens.length)];
                const finalPayload = session.messageContent + randomVariant;

                await channel.send(finalPayload);
                session.sentCount++;
            } catch (err) {
                session.failCount++;
                console.error(`[Execution Error] Channel ${channelId}:`, err.message);
                
                if (err.status === 429 || (err.message && err.message.toLowerCase().includes('rate limit'))) {
                    console.warn('[Rate Limit Guard] Rate limit hit. Enforcing 60-second backoff...');
                    await new Promise(resolve => setTimeout(resolve, 60000));
                }
            }

            const channelBuffer = Math.floor(Math.random() * 6000) + 6000;
            await new Promise(resolve => setTimeout(resolve, channelBuffer));
        }

        if (session.isRunning && session.activeClient === userClient) {
            const randomDelaySecs = Math.floor(Math.random() * (session.maxDelay - session.minDelay + 1)) + session.minDelay;
            session.timeoutId = setTimeout(runLoop, randomDelaySecs * 1000);
        }
    };

    userClient.on('error', (err) => {
        console.error('[Selfbot Gateway Error]:', err.message);
    });

    session.timeoutId = setTimeout(runLoop, initialDelaySecs * 1000);
}

controlBot.on('interactionCreate', async interaction => {
    try {
        if (!interaction.guildId || !ALLOWED_GUILDS.includes(interaction.guildId)) {
            if (interaction.isRepliable()) {
                return interaction.reply({ content: '❌ This bot is not authorized to be used in this server.', ephemeral: true });
            }
            return;
        }

        const userId = interaction.user.id;
        const userSession = activeSessions.get(userId) || {
            isRunning: false,
            sentCount: 0,
            failCount: 0,
            timeoutId: null,
            targetChannels: [],
            messageContent: '',
            minDelay: 90,
            maxDelay: 180,
            userToken: null,
            activeClient: null,
            currentProxy: null
        };

        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'admin-session-stop') {
                if (userId !== ADMIN_USER_ID) {
                    return interaction.reply({ content: '❌ You do not have permission to use this administrative command.', ephemeral: true });
                }

                const modal = new ModalBuilder()
                    .setCustomId('admin_session_modal')
                    .setTitle('Admin Session & Restriction Manager');

                const targetUserInput = new TextInputBuilder()
                    .setCustomId('admin_target_user_id')
                    .setLabel('Target User ID')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter Discord User ID...')
                    .setRequired(true);

                const actionInput = new TextInputBuilder()
                    .setCustomId('admin_action_type')
                    .setLabel('Action (stop ads, restrict, unrestrict)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Type: stop ads, restrict, or unrestrict')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(targetUserInput),
                    new ActionRowBuilder().addComponents(actionInput)
                );

                return interaction.showModal(modal);
            }
            else if (interaction.commandName === 'admin-active-status') {
                if (userId !== ADMIN_USER_ID) {
                    return interaction.reply({ content: '❌ You do not have permission to use this administrative command.', ephemeral: true });
                }

                if (activeSessions.size === 0) {
                    const embed = new EmbedBuilder()
                        .setTitle('🛡️ Admin Active Status')
                        .setDescription('❌ No active advertising sessions are currently running across any user.')
                        .setColor(0xED4245)
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Admin Active Status Report')
                    .setColor(0x57F287)
                    .setTimestamp();

                let descriptionLines = [];
                for (const [sUserId, session] of activeSessions.entries()) {
                    if (session.isRunning) {
                        const tag = session.activeClient && session.activeClient.user ? session.activeClient.user.tag : 'Unknown';
                        descriptionLines.push(`• **User ID:** \`${sUserId}\` (${tag})\n  - **Sent:** ${session.sentCount} | **Failed:** ${session.failCount} | **Channels:** ${session.targetChannels.length}\n  - **Proxy:** \`${session.currentProxy || 'N/A'}\``);
                    }
                }

                if (descriptionLines.length === 0) {
                    embed.setDescription('❌ No active campaigns currently running.');
                } else {
                    embed.setDescription(descriptionLines.join('\n\n'));
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            else if (interaction.commandName === 'admin_proxies') {
                if (userId !== ADMIN_USER_ID) {
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

                if (!hasRole && userId !== ADMIN_USER_ID) {
                    return interaction.reply({ content: '❌ You do not have the required role to use this command.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle('🚀 Elite Broadcast Automation Suite')
                    .setDescription('Welcome to your personal enterprise-grade automated broadcasting dashboard. Launch, configure, and manage your continuous engagement campaigns securely and efficiently.\n\n**💡 Management Commands:**\n• Use `/adv status` to check your running campaign metrics.\n• Use `/adv stop` to safely terminate your active broadcast loop.')
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
                            { name: 'Status', value: userSession.isRunning ? '🟢 Running' : '🔴 Stopped', inline: true },
                            { name: 'Messages Sent', value: `${userSession.sentCount}`, inline: true },
                            { name: 'Failed Attempts', value: `${userSession.failCount}`, inline: true },
                            { name: 'Delay Range', value: `${userSession.minDelay}s - ${userSession.maxDelay}s`, inline: false }
                        )
                        .setColor(userSession.isRunning ? 0x57F287 : 0xED4245)
                        .setTimestamp();

                    await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
                } 
                else if (sub === 'stop') {
                    if (!userSession.isRunning) {
                        return interaction.reply({ content: '⚠️ Your advertising automation is not currently running.', ephemeral: true });
                    }
                    stopAutomationForUser(userId);
                    await interaction.reply({ content: '🛑 Your advertising automation has been successfully terminated.', ephemeral: true });
                }
            }
        }
        else if (interaction.isButton()) {
            if (interaction.customId === 'start_adv_direct') {
                const restrictedUsers = getRestrictedUsers();
                if (restrictedUsers.includes(userId)) {
                    return interaction.reply({ content: '❌ **Access Denied:** Your account has been restricted from starting advertising campaigns by an administrator.', ephemeral: true });
                }

                if (userSession.isRunning) {
                    return interaction.reply({ content: '⚠️ Your advertising automation is already running.', ephemeral: true });
                }

                const savedCfg = loadCampaignConfig(userId);
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

                const validationResult = await validateAndStartCampaign(userId, savedCfg.userToken, assignedProxy, savedCfg.targetChannels);
                if (!validationResult.success) {
                    pool.push(assignedProxy);
                    saveProxyPool(pool);
                    return interaction.editReply({ content: validationResult.error });
                }

                const session = validationResult.session;
                session.messageContent = savedCfg.messageContent;
                session.minDelay = savedCfg.minDelay || 90;
                session.maxDelay = savedCfg.maxDelay || 180;

                setupClientLoop(userId, session);

                await interaction.editReply({ 
                    content: `🚀 **Campaign Started Successfully!**\nTargeting **${savedCfg.targetChannels.length} channel(s)**.` 
                });
            }
            else if (interaction.customId === 'open_adv_modal') {
                const savedCfg = loadCampaignConfig(userId);

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
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'admin_session_modal') {
                if (userId !== ADMIN_USER_ID) {
                    return interaction.reply({ content: '❌ Unauthorized.', ephemeral: true });
                }

                const targetUserId = interaction.fields.getTextInputValue('admin_target_user_id').trim();
                const actionType = interaction.fields.getTextInputValue('admin_action_type').trim().toLowerCase();

                let restrictedUsers = getRestrictedUsers();

                if (actionType === 'stop ads' || actionType === 'stop') {
                    if (activeSessions.has(targetUserId)) {
                        stopAutomationForUser(targetUserId);
                        return interaction.reply({ content: `✅ Successfully stopped active advertising session for user ID \`${targetUserId}\`.`, ephemeral: true });
                    } else {
                        return interaction.reply({ content: `⚠️ No active advertising session found for user ID \`${targetUserId}\`.`, ephemeral: true });
                    }
                } 
                else if (actionType === 'restrict') {
                    stopAutomationForUser(targetUserId);
                    if (!restrictedUsers.includes(targetUserId)) {
                        restrictedUsers.push(targetUserId);
                        saveRestrictedUsers(restrictedUsers);
                    }
                    return interaction.reply({ content: `🚫 Successfully restricted user ID \`${targetUserId}\`. They can no longer start advertising campaigns until unrestricted.`, ephemeral: true });
                } 
                else if (actionType === 'unrestrict') {
                    const index = restrictedUsers.indexOf(targetUserId);
                    if (index !== -1) {
                        restrictedUsers.splice(index, 1);
                        saveRestrictedUsers(restrictedUsers);
                    }
                    return interaction.reply({ content: `✅ Successfully unrestricted user ID \`${targetUserId}\`. They can now start advertising campaigns again.`, ephemeral: true });
                } 
                else {
                    return interaction.reply({ content: '❌ Invalid action specified. Please use `stop ads`, `restrict`, or `unrestrict`.', ephemeral: true });
                }
            }
            else if (interaction.customId === 'adv_config_modal') {
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

                saveCampaignConfig(userId, {
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
        }
    } catch (error) {
        console.error('Interaction error:', error);
        if (interaction.isRepliable() && !interaction.replied) {
            await interaction.reply({ content: 'An unexpected error occurred.', ephemeral: true }).catch(() => {});
        }
    }
});

function stopAutomationForUser(userId) {
    const session = activeSessions.get(userId);
    if (!session) return;

    if (session.currentProxy) {
        const pool = getProxyPool();
        if (!pool.includes(session.currentProxy)) {
            pool.push(session.currentProxy);
            saveProxyPool(pool);
        }
    }

    session.isRunning = false;
    if (session.timeoutId) {
        clearTimeout(session.timeoutId);
        session.timeoutId = null;
    }
    if (session.activeClient) {
        try {
            session.activeClient.destroy();
        } catch {}
        session.activeClient = null;
    }
    activeSessions.delete(userId);

    // Remove from persistent list if manually stopped
    let currentActiveList = getPersistentActiveUsers();
    const index = currentActiveList.indexOf(userId);
    if (index !== -1) {
        currentActiveList.splice(index, 1);
        savePersistentActiveUsers(currentActiveList);
    }
}

controlBot.login(process.env.DISCORD_TOKEN);
