require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionsBitField
} = require('discord.js');
const { db, admin } = require('./firebase'); // Import Firebase Database
const puppeteer = require('puppeteer');
const { AttachmentBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;

// ─── Server Role IDs (Sleeping Hall) ──────────────────────────────────
// Members
const ROLE_MEMBER_DREAMWALKER = '1443612362606379090';
const ROLE_MEMBER_HALLWARRIOR = '1469545190090870946';

// Leadership / Staff
const ROLE_DEPUTY_COMMANDER = '1478001015738470482';
const ROLE_COMMANDER = '1478000173983600711';
const ROLE_VICE = '1443205424882122772';
const ROLE_STAFF = '1443205664066502739'; // Dream Watcher
const ROLE_MODERATOR = '1443207709687025684';
const ROLE_ADMIN = '1443205952794005667';
const ROLE_OWNER = '1443208931001237574';
const ROSTER_CHANNEL_ID = '1501291297280098384';
const EVENTS_CHANNEL_ID = '1501893168206188717';
const BOT_OWNER_ID = '797429955649732639';
const ACCOUNT_REQUEST_CHANNEL_ID = '1443215089896263680';
const DEFAULT_PORTAL_PASSWORD = 'GVG2026!';

function isAdminOrOwner(member, userId) {
  return (
    userId === BOT_OWNER_ID ||
    member?.roles?.cache?.has(ROLE_ADMIN) ||
    member?.roles?.cache?.has(ROLE_OWNER) ||
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
  );
}

function isStaffAdminOrOwner(member, userId) {
  return member?.roles?.cache?.has(ROLE_STAFF) || isAdminOrOwner(member, userId);
}

function isModOrAdminOrOwner(member, userId) {
  return member?.roles?.cache?.has(ROLE_MODERATOR) || member?.roles?.cache?.has(ROLE_ADMIN) || isAdminOrOwner(member, userId);
}

function getNextPhtTimestamp(targetDay, hour = 21, minute = 30) {
  const phtOffsetMs = 8 * 60 * 60 * 1000;
  const nowUtc = new Date();
  const nowPht = new Date(nowUtc.getTime() + phtOffsetMs);

  let daysUntil = (targetDay - nowPht.getUTCDay() + 7) % 7;
  let targetPht = new Date(Date.UTC(
    nowPht.getUTCFullYear(),
    nowPht.getUTCMonth(),
    nowPht.getUTCDate() + daysUntil,
    hour,
    minute,
    0
  ));

  if (targetPht.getTime() <= nowPht.getTime()) {
    targetPht = new Date(Date.UTC(
      nowPht.getUTCFullYear(),
      nowPht.getUTCMonth(),
      nowPht.getUTCDate() + daysUntil + 7,
      hour,
      minute,
      0
    ));
  }

  const targetUtcMs = targetPht.getTime() - phtOffsetMs;
  return Math.floor(targetUtcMs / 1000);
}

client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}!`);
  console.log(`✅ Connected to Firebase Database!`);
});

// Listen for messages (To setup the application panel and attendance panel)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Mod command to spawn the Application Panel
  if (message.content === '!setup-apply' && isAdminOrOwner(message.member, message.author.id)) {
    const embed = new EmbedBuilder()
      .setTitle('━━━━✦APPLICATION QUESTIONS✦━━━━')
      .setDescription('To apply, click the button below. We highly recommend writing your answers in another page or notepad and pasting them in.')
      .setColor(0x2b2d31);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('apply_button')
        .setLabel('Apply Now')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete();
  }

  // Mod command to spawn the Weekly Attendance Panel
  if (message.content === '!setup-league' && isAdminOrOwner(message.member, message.author.id)) {
    try {
      const messages = await message.channel.messages.fetch({ limit: 50 });
      const oldPanel = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === '🏆 Weekly League Attendance');
      if (oldPanel) await oldPanel.delete().catch(() => { });
    } catch (e) { console.error("Error cleaning up old panel:", e); }

    const embed = new EmbedBuilder()
      .setTitle('🏆 Weekly League Attendance')
      .setDescription(`Check the roles you can play for **League** this week.`)
      .setColor(0xfa5f5f);

    const satRow1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('league_sat_top_lane').setLabel('Sat: Top Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('league_sat_mid_lane').setLabel('Sat: Mid Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('league_sat_bot_lane').setLabel('Sat: Bot Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('league_sat_flanker').setLabel('Sat: Flanker').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('league_sat_reserved').setLabel('Sat: Reserved').setStyle(ButtonStyle.Secondary)
    );
    const satRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('league_sat_none').setLabel('Sat: None').setStyle(ButtonStyle.Danger)
    );

    const sunRow1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('league_sun_top_lane').setLabel('Sun: Top Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('league_sun_mid_lane').setLabel('Sun: Mid Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('league_sun_bot_lane').setLabel('Sun: Bot Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('league_sun_flanker').setLabel('Sun: Flanker').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('league_sun_reserved').setLabel('Sun: Reserved').setStyle(ButtonStyle.Secondary)
    );
    const sunRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('league_sun_none').setLabel('Sun: None').setStyle(ButtonStyle.Danger)
    );

    await message.channel.send({ embeds: [embed], components: [satRow1, satRow2, sunRow1, sunRow2] });
    await message.delete();
  }

  if (message.content === '!setup-ranked' && isAdminOrOwner(message.member, message.author.id)) {
    try {
      const messages = await message.channel.messages.fetch({ limit: 50 });
      const oldPanel = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === '⚔️ Weekly Ranked Attendance');
      if (oldPanel) await oldPanel.delete().catch(() => { });
    } catch (e) { console.error("Error cleaning up old panel:", e); }

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Weekly Ranked Attendance')
      .setDescription(`Check the roles you can play for **Ranked** this week.`)
      .setColor(0xfa5f5f);

    const satRow1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_sat_top_lane').setLabel('Sat: Top Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ranked_sat_mid_lane').setLabel('Sat: Mid Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ranked_sat_bot_lane').setLabel('Sat: Bot Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ranked_sat_flanker').setLabel('Sat: Flanker').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ranked_sat_reserved').setLabel('Sat: Reserved').setStyle(ButtonStyle.Secondary)
    );
    const satRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_sat_none').setLabel('Sat: None').setStyle(ButtonStyle.Danger)
    );

    const sunRow1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_sun_top_lane').setLabel('Sun: Top Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ranked_sun_mid_lane').setLabel('Sun: Mid Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ranked_sun_bot_lane').setLabel('Sun: Bot Lane').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ranked_sun_flanker').setLabel('Sun: Flanker').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ranked_sun_reserved').setLabel('Sun: Reserved').setStyle(ButtonStyle.Secondary)
    );
    const sunRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_sun_none').setLabel('Sun: None').setStyle(ButtonStyle.Danger)
    );

    await message.channel.send({ embeds: [embed], components: [satRow1, satRow2, sunRow1, sunRow2] });
    await message.delete();
  }

  // Mod command to spawn the Event Manager Panel
  if (message.content === '!setup-events' && isAdminOrOwner(message.member, message.author.id)) {
    const embed = new EmbedBuilder()
      .setTitle('🛡️ Guild Event Manager')
      .setDescription('Schedule a new Guild Event (Hero Realms, Raids, etc). Everyone who RSVPs will get a ping when it starts!')
      .setColor(0x3498db);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('event_create')
        .setLabel('Schedule Event')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete();
  }

  // Mod command to spawn the Member Manager Panel
  if (message.content === '!setup-member-add' && isAdminOrOwner(message.member, message.author.id)) {
    const embed = new EmbedBuilder()
      .setTitle('👥 Member Manager')
      .setDescription('Admins can add a new member profile to the database.')
      .setColor(0x5865f2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('admin_add_member')
        .setLabel('Add Member')
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete();
  }

  // Command to spawn member info / portal help panel
  if (message.content === '!setup-info' && isAdminOrOwner(message.member, message.author.id)) {
    const embed = new EmbedBuilder()
      .setTitle('ℹ️ GVG Portal Info')
      .setDescription(
        '**How to Participate in GVG**\n\n' +
        '**1) Confirm Attendance (Discord)**\n' +
        'Use the role buttons for **League** and **Ranked** on Saturday and Sunday.\n' +
        'Use **None** if you are unavailable.\n\n' +
        '**2) Use the Web Portal** (<https://sleepinghall-portal.web.app>)\n' +
        '• Login with admin-provided credentials.\n' +
        '• Update profile fields (class, power, innerways).\n' +
        '• Update attendance and review live roster placements.\n\n' +
        '**3) Portal Access Check**\n' +
        '• Click **Confirm Portal Access** below.\n' +
        '• You will get a private reply with your username and default password: `GVG2026!`\n' +
        '• You can change your password in the portal. If you wish to reset your password, reach out to an admin.\n' +
        '• If no account is found, click **Request Account** to notify moderators.'
      )
      .setColor(0x5865f2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('portal_info_confirm')
        .setLabel('Confirm Portal Access')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete();
  }

  // Command to spawn GVG reminder panel for staff/admin
  if (message.content === '!setup-gvg-reminder' && isAdminOrOwner(message.member, message.author.id)) {
    const embed = new EmbedBuilder()
      .setTitle('📣 GVG Reminder Tool')
      .setDescription('Staff/Admin can use the button below to ping members who confirmed GVG attendance.')
      .setColor(0xfa5f5f);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('gvg_send_reminder')
        .setLabel('Send GVG Reminder')
        .setStyle(ButtonStyle.Danger)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete();
  }
});

// Background Scheduler: Checks every 10 seconds for due events
setInterval(async () => {
  try {
    const now = new Date();
    // Fetch all unreminded events to completely avoid index requirements
    const snapshot = await db.collection('scheduled_events').where('reminded', '==', false).get();

    if (snapshot.empty) return;

    for (const doc of snapshot.docs) {
      const event = doc.data();
      if (event.startTime.toDate() > now) continue; // Not due yet

      const channel = await client.channels.fetch(event.channelId).catch(() => null);
      if (channel) {
        // 1. Delete the old RSVP message to keep the channel clean
        if (event.messageId) {
          const oldMsg = await channel.messages.fetch(event.messageId).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => { });
        }

        console.log(`📢 Pinging for event: ${event.name}`);
        const rsvpList = event.rsvps && event.rsvps.length > 0
          ? event.rsvps.map(id => `<@${id}>`).join(' ')
          : 'No one';

        const embed = new EmbedBuilder()
          .setTitle(`⏰ TIME FOR: ${event.name}`)
          .setDescription(`The event scheduled by <@${event.creatorId}> is starting NOW!\n\n**Participants:**\n${rsvpList}`)
          .setColor(0x00ff00);

        await channel.send({ content: `🔔 **ATTENTION:** ${rsvpList}`, embeds: [embed] });
      }

      // Mark as reminded so we don't ping again
      await doc.ref.update({ reminded: true });
    }
  } catch (err) {
    console.error("Scheduler Error:", err);
  }
}, 10000);

// Handle Interactions (Buttons & Modals)
client.on('interactionCreate', async (interaction) => {

  // ==========================================
  // 1. EVENT CREATION BUTTON -> SHOW MODAL
  // ==========================================
  if (interaction.isButton() && interaction.customId === 'event_create') {
    const modal = new ModalBuilder().setCustomId('modal_event').setTitle('Schedule Guild Event');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('event_name').setLabel('Event Name').setValue('Guild Hero Realm + Normal Hero Realm').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('event_time').setLabel('When? (e.g. "4h", "30m", or "in 2 hours")').setPlaceholder('Example: 4h').setStyle(TextInputStyle.Short).setRequired(true))
    );
    await interaction.showModal(modal);
  }

  // ==========================================
  // 2. EVENT MODAL SUBMIT
  // ==========================================
  if (interaction.isModalSubmit() && interaction.customId === 'modal_event') {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.fields.getTextInputValue('event_name');
    const timeInput = interaction.fields.getTextInputValue('event_time');

    // Simple time parser
    let minutes = 0;
    const match = timeInput.match(/(\d+)\s*(h|m|hours|minutes|mins)?/i);
    if (match) {
      const num = parseInt(match[1]);
      const unit = (match[2] || 'm').toLowerCase();
      minutes = (unit.startsWith('h')) ? num * 60 : num;
    }

    if (minutes <= 0) return interaction.editReply('❌ Invalid time format. Use "4h", "30m", etc.');

    try {
      const startTime = new Date();
      startTime.setMinutes(startTime.getMinutes() + minutes);

      const embed = new EmbedBuilder()
        .setTitle(`🛡️ NEW EVENT: ${name}`)
        .setDescription(`Scheduled by <@${interaction.user.id}>\n\n**Starts in:** ${timeInput}\n**Estimated Time:** <t:${Math.floor(startTime.getTime() / 1000)}:R>\n\nClick the button below to RSVP and get a ping!`)
        .setColor(0x3498db);

      // Create the event doc FIRST so we have the ID for the button
      const eventRef = db.collection('scheduled_events').doc();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rsvp_${eventRef.id}`).setLabel('RSVP Now').setEmoji('🙋‍♂️').setStyle(ButtonStyle.Success)
      );

      const eventsChannel = await client.channels.fetch(EVENTS_CHANNEL_ID).catch(() => null);
      if (!eventsChannel || !eventsChannel.isTextBased()) {
        return interaction.editReply('❌ Events channel is unavailable. Please contact an admin.');
      }

      const rsvpMsg = await eventsChannel.send({ embeds: [embed], components: [row] });

      await eventRef.set({
        name,
        creatorId: interaction.user.id,
        startTime,
        channelId: eventsChannel.id,
        messageId: rsvpMsg.id, // Save this so we can delete it later!
        rsvps: [interaction.user.id],
        reminded: false,
        createdAt: new Date()
      });

      await interaction.editReply(`✅ Event scheduled for <t:${Math.floor(startTime.getTime() / 1000)}:F>`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Database error.');
    }
  }

  // ==========================================
  // 3. RSVP BUTTON CLICKED
  // ==========================================
  if (interaction.isButton() && interaction.customId.startsWith('rsvp_')) {
    const eventId = interaction.customId.split('_')[1];
    await interaction.deferReply({ ephemeral: true });

    try {
      const docRef = db.collection('scheduled_events').doc(eventId);
      const doc = await docRef.get();

      if (!doc.exists) return interaction.editReply('❌ Event no longer exists.');

      const data = doc.data();
      if (data.reminded) return interaction.editReply('❌ This event has already started!');

      if (data.rsvps.includes(interaction.user.id)) {
        // Remove RSVP
        await docRef.update({ rsvps: admin.firestore.FieldValue.arrayRemove(interaction.user.id) });
        return interaction.editReply('💨 You have removed your RSVP.');
      } else {
        // Add RSVP
        await docRef.update({ rsvps: admin.firestore.FieldValue.arrayUnion(interaction.user.id) });
        return interaction.editReply('✅ You are RSVP\'d! I will ping you when it starts.');
      }
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ RSVP failed.');
    }
  }

  // ==========================================
  // 4. APPLICATION BUTTON CLICKED -> SHOW MODAL
  // ==========================================
  if (interaction.isButton() && interaction.customId === 'apply_button') {
    const modal = new ModalBuilder()
      .setCustomId('apply_modal')
      .setTitle('Guild Application');

    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ign_id').setLabel('1. What is your IGN and ID #?').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('best_build').setLabel('2. Best build info?').setStyle(TextInputStyle.Paragraph).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('arena_rank').setLabel('3. Current Arena Rank?').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('weekly_activity').setLabel('4. Avg weekly Guild Activity?').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('preferred_positions').setLabel('5. Positions interested in?').setStyle(TextInputStyle.Paragraph).setRequired(true))
    );

    await interaction.showModal(modal);
  }

  // ==========================================
  // 5. ADMIN ADD MEMBER BUTTON -> SHOW MODAL
  // ==========================================
  if (interaction.isButton() && interaction.customId === 'admin_add_member') {
    if (!isAdminOrOwner(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: '❌ Admin permission required.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId('admin_add_member_modal')
      .setTitle('Add New Member');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('new_member_username')
          .setLabel('Username')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('new_member_character_name')
          .setLabel('Character Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('new_member_discord_id')
          .setLabel('Discord ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    return interaction.showModal(modal);
  }

  // ==========================================
  // 2. MODAL SUBMITTED -> CREATE TICKET & DATABASE ENTRY
  // ==========================================
  if (interaction.isModalSubmit() && interaction.customId === 'apply_modal') {
    await interaction.deferReply({ ephemeral: true });

    const answers = {
      ign: interaction.fields.getTextInputValue('ign_id'),
      build: interaction.fields.getTextInputValue('best_build'),
      rank: interaction.fields.getTextInputValue('arena_rank'),
      activity: interaction.fields.getTextInputValue('weekly_activity'),
      positions: interaction.fields.getTextInputValue('preferred_positions'),
      discordId: interaction.user.id,
      discordTag: interaction.user.tag,
      status: 'pending',
      timestamp: new Date()
    };

    try {
      // Save pending application to Firestore
      const docRef = await db.collection('pending_applications').add(answers);

      // Create Private Channel
      const channel = await interaction.guild.channels.create({
        name: `app-${interaction.user.username}`.substring(0, 30),
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: ROLE_STAFF, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      // Post Application with Approve/Deny buttons
      const embed = new EmbedBuilder()
        .setTitle(`New Application: ${answers.ign}`)
        .setColor(0x2b2d31)
        .addFields(
          { name: 'IGN & ID', value: answers.ign },
          { name: 'Build', value: answers.build },
          { name: 'Arena Rank', value: answers.rank },
          { name: 'Weekly Activity', value: answers.activity },
          { name: 'Positions', value: answers.positions }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_${docRef.id}`).setLabel('Approve & Create Account').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`deny_${docRef.id}`).setLabel('Deny & Close').setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content: `Application by <@${interaction.user.id}> | <@&${ROLE_STAFF}>\nPlease upload your Arena Rank screenshot here.`,
        embeds: [embed],
        components: [row]
      });

      await interaction.editReply(`✅ Application submitted! Check <#${channel.id}>`);
    } catch (error) {
      console.error(error);
      await interaction.editReply('❌ Error creating ticket. Contact an admin.');
    }
  }

  // ==========================================
  // 6. ADMIN ADD MEMBER MODAL SUBMIT
  // ==========================================
  if (interaction.isModalSubmit() && interaction.customId === 'admin_add_member_modal') {
    if (!isAdminOrOwner(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: '❌ Admin permission required.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const username = interaction.fields.getTextInputValue('new_member_username').trim();
      const characterName = interaction.fields.getTextInputValue('new_member_character_name').trim();
      const discordIdRaw = interaction.fields.getTextInputValue('new_member_discord_id').trim();
      const discordId = discordIdRaw.replace(/[<@!>]/g, '');

      if (!/^\d{10,25}$/.test(discordId)) {
        return interaction.editReply('❌ Invalid Discord ID. Please provide numeric user ID.');
      }

      const existingSnap = await db.collection('users').where('discordId', '==', discordId).limit(1).get();
      if (!existingSnap.empty) {
        return interaction.editReply('❌ A member with that Discord ID already exists.');
      }

      const newUserRef = db.collection('users').doc();
      await newUserRef.set({
        id: newUserRef.id,
        uid: newUserRef.id,
        name: characterName,
        loginUsername: username,
        discordId,
        role: 'Regular Member',
        class: 'Unknown',
        rank: 'Unranked',
        class1: '',
        class2: '',
        goosePower: 0,
        attendance: {
          saturday: false,
          sunday: false,
          satMode: 'none',
          sunMode: 'none',
          leagueSatMode: 'none',
          leagueSunMode: 'none',
          rankedSatMode: 'none',
          rankedSunMode: 'none',
          skip: false,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        },
        isArchived: false,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByAdmin: interaction.user.id
      });

      await interaction.editReply(
        `✅ Member created.\n` +
        `• Username: **${username}**\n` +
        `• Character: **${characterName}**\n` +
        `• Discord ID: \`${discordId}\``
      );
    } catch (error) {
      console.error('Admin Add Member Error:', error);
      await interaction.editReply('❌ Failed to create member.');
    }
  }

  // ==========================================
  // 3. STAFF CLICKS "APPROVE" OR "DENY"
  // ==========================================
  if (interaction.isButton() && (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('deny_'))) {
    // Only allow staff
    if (!isStaffAdminOrOwner(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: '❌ You do not have permission to do this.', ephemeral: true });
    }

    const action = interaction.customId.split('_')[0]; // 'approve' or 'deny'
    const docId = interaction.customId.split('_')[1];

    await interaction.deferReply();

    if (action === 'approve') {
      try {
        // Read application from Firestore
        const appDoc = await db.collection('pending_applications').doc(docId).get();
        if (!appDoc.exists) return interaction.editReply('❌ Application data not found in database.');

        const data = appDoc.data();

        // Anti-self-approval check
        if (interaction.user.id === data.discordId) {
          return interaction.editReply('❌ You cannot approve your own application!');
        }

        // Parse IGN and ID (Basic logic assuming format "Name (ID)")
        let playerName = data.ign.split('(')[0].trim() || data.ign;
        let playerId = data.ign.match(/\(([^)]+)\)/)?.[1] || "000000";

        // Create Official Account in the main 'users' collection
        await db.collection('users').doc(playerId).set({
          name: playerName,
          id: playerId,
          discordId: data.discordId,
          discordTag: data.discordTag,
          role: 'Regular Member', // Default role
          class: 'Unknown',
          rank: data.rank,
          attendance: {
            saturday: false,
            sunday: false,
            satMode: 'none',
            sunMode: 'none',
            lastUpdated: new Date()
          },
          isArchived: false,
          joinedAt: new Date()
        });

        // Delete pending application
        await db.collection('pending_applications').doc(docId).delete();

        await interaction.editReply('✅ **Application Approved!** Website account automatically created for them.');

        // Remove buttons from the original message
        await interaction.message.edit({ components: [] });

      } catch (error) {
        console.error("Error creating user:", error);
        await interaction.editReply('❌ Error creating website account.');
      }
    }
    else if (action === 'deny') {
      await db.collection('pending_applications').doc(docId).delete();
      await interaction.editReply('❌ **Application Denied.** This channel will be deleted in 5 seconds.');
      setTimeout(() => interaction.channel.delete().catch(console.error), 5000);
    }
  }

  // ==========================================
  // 7. MEMBER PORTAL INFO BUTTON
  // ==========================================
  if (interaction.isButton() && interaction.customId === 'portal_info_confirm') {
    await interaction.deferReply({ ephemeral: true });

    try {
      const snapshot = await db.collection('users').where('discordId', '==', interaction.user.id.toString()).limit(1).get();

      if (snapshot.empty) {
        const requestRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('portal_request_account')
            .setLabel('Request Account')
            .setStyle(ButtonStyle.Success)
        );

        return interaction.editReply({
          content: '❌ No portal account found for your Discord ID.\nClick **Request Account** and moderators will be notified.',
          components: [requestRow]
        });
      }

      const userData = snapshot.docs[0].data();

      // Block archived users
      if (userData.isArchived === true) {
        return interaction.editReply('🚫 This account has been disabled by admins. Please contact a moderator if you believe this is a mistake.');
      }

      const username = userData.loginUsername || userData.name || 'Unknown';

      await interaction.editReply(
        `✅ **Portal account found**\n` +
        `• Username: **${username}**\n` +
        `• Default Password: \`${DEFAULT_PORTAL_PASSWORD}\`\n\n` +
        `If this password no longer works, ask moderators for a reset.`
      );
    } catch (error) {
      console.error('Portal Info Error:', error);
      await interaction.editReply('❌ Failed to check portal account. Please try again later.');
    }
  }

  // ==========================================
  // 8. MEMBER ACCOUNT REQUEST BUTTON
  // ==========================================
  if (interaction.isButton() && interaction.customId === 'portal_request_account') {
    await interaction.deferReply({ ephemeral: true });

    try {
      const reqChannel = await client.channels.fetch(ACCOUNT_REQUEST_CHANNEL_ID).catch(() => null);
      if (!reqChannel || !reqChannel.isTextBased()) {
        return interaction.editReply('❌ Account request channel is not available right now.');
      }

      await reqChannel.send({
        content: `<@&${ROLE_MODERATOR}> New portal account request from <@${interaction.user.id}> (\`${interaction.user.id}\`).`
      });

      await interaction.editReply('✅ Account request sent to moderators.');
    } catch (error) {
      console.error('Portal Request Error:', error);
      await interaction.editReply('❌ Failed to send account request. Please try again later.');
    }
  }

  // ==========================================
  // 9. GVG REMINDER BUTTON
  // ==========================================
  if (interaction.isButton() && interaction.customId === 'gvg_send_reminder') {
    if (!isModOrAdminOrOwner(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: '❌ You do not have permission to do this.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const usersSnap = await db.collection('users').get();
      const attendeeIds = new Set();

      usersSnap.forEach((doc) => {
        const data = doc.data();
        const att = data.attendance || {};
        const hasSat = (att.leagueSatMode && att.leagueSatMode !== 'none') || (att.rankedSatMode && att.rankedSatMode !== 'none');
        const hasSun = (att.leagueSunMode && att.leagueSunMode !== 'none') || (att.rankedSunMode && att.rankedSunMode !== 'none');
        const discordId = (data.discordId || '').toString().trim();

        if ((hasSat || hasSun) && /^\d{10,25}$/.test(discordId)) attendeeIds.add(discordId);
      });

      if (attendeeIds.size === 0) {
        return interaction.editReply('ℹ️ No confirmed GVG attendees were found to ping.');
      }

      const saturdayTs = getNextPhtTimestamp(6, 21, 30); // Saturday 9:30 PM PHT
      const sundayTs = getNextPhtTimestamp(0, 21, 30);   // Sunday 9:30 PM PHT
      const mentions = Array.from(attendeeIds).map((id) => `<@${id}>`).join(' ');

      const reminderChannel = await client.channels.fetch(ROSTER_CHANNEL_ID).catch(() => null);
      if (!reminderChannel || !reminderChannel.isTextBased()) {
        return interaction.editReply('❌ Reminder channel is unavailable. Please contact an admin.');
      }

      await reminderChannel.send(
        `📣 **GVG Reminder**\n${mentions}\n\n` +
        `Please be ready for GVG time:\n` +
        `• Saturday: <t:${saturdayTs}:F> (<t:${saturdayTs}:R>)\n` +
        `• Sunday: <t:${sundayTs}:F> (<t:${sundayTs}:R>)`
      );

      await interaction.editReply(`✅ Reminder sent and pinged ${attendeeIds.size} confirmed attendee(s).`);
    } catch (error) {
      console.error('GVG Reminder Error:', error);
      await interaction.editReply('❌ Failed to send GVG reminder.');
    }
  }
});

// ─── ROSTER SYNC & PNG GENERATION ────────────────────────────────────


// ─── ROSTER SYNC & PNG GENERATION ────────────────────────────────────

/**
 * Automatically syncs a user into the roster matrix in Firestore.
 */
async function syncUserToRoster(playerId, day, type, lane) {
  const rosterRef = db.collection('settings').doc('rosters');
  const dayName = day === 'sat' ? 'Saturday' : 'Sunday';
  const typeName = type === 'league' ? 'League' : 'Ranked';
  const lanes = ['top_lane', 'mid_lane', 'bot_lane', 'flanker', 'reserved'];

  await db.runTransaction(async (tx) => {
    const rosterDoc = await tx.get(rosterRef);
    if (!rosterDoc.exists) return;

    const data = rosterDoc.data();
    if (!data[typeName]) data[typeName] = {};
    if (!data[typeName][dayName]) {
      data[typeName][dayName] = { top_lane: [], mid_lane: [], bot_lane: [], flanker: [], reserved: [] };
    }

    const dayData = data[typeName][dayName];

    // Remove from only this type/day so League + Ranked can coexist.
    lanes.forEach((l) => {
      if (!Array.isArray(dayData[l])) return;
      dayData[l] = dayData[l].map((slot) => {
        if (slot === playerId) return null;
        if (slot && typeof slot === 'object' && slot.uid === playerId) return null;
        return slot;
      });
    });

    if (lane && lane !== 'none') {
      if (!Array.isArray(dayData[lane])) dayData[lane] = new Array(10).fill(null);

      const emptyIdx = dayData[lane].findIndex((slot) => slot === null);
      if (emptyIdx !== -1) dayData[lane][emptyIdx] = playerId;
      else dayData[lane].push(playerId);
    }

    tx.set(rosterRef, data);
  });
}

/**
 * Uses Puppeteer to generate roster PNGs and sends them to Discord.
 * Sends one PNG for League and one PNG for Ranked to avoid tall-image clipping.
 */
async function generateRosterPNG(channel, day, type) {
  const dayName = day === 'sat' ? 'Saturday' : 'Sunday';

  let browser;
  try {
    // 1. Fetch Data directly from Firestore
    const rosterSnap = await db.collection('settings').doc('rosters').get();
    if (!rosterSnap.exists) return;
    const rosterData = rosterSnap.data();

    const usersSnap = await db.collection('users').get();
    const allMembers = [];
    usersSnap.forEach(doc => {
      if (!doc.id.includes('_placeholder')) allMembers.push({ uid: doc.id, ...doc.data() });
    });

    // 2. Build HTML per category
    const categories = ['League', 'Ranked'];
    const phases = ['top_lane', 'mid_lane', 'bot_lane', 'flanker', 'reserved'];
    const buildCategoryHtml = (cat) => {
      const catDayData = rosterData[cat]?.[dayName];
      if (!catDayData) return null;

      let teamsHtml = `<div class="category-section"><h2>${cat.toUpperCase()}</h2>`;
      phases.forEach(side => {
        const slots = catDayData[side] || new Array(10).fill(null);
        let teamTitle = side.replace('_', ' ').toUpperCase();
        if (side === 'reserved') teamTitle = 'RESERVE TEAM';

        let sideHtml = `<div class="print-team"><h3>${teamTitle}</h3><div style="display:flex; gap:20px; width:100%; margin-bottom:15px;">`;
        for (let t = 0; t < 2; t++) {
          sideHtml += `<table class="print-table">
            <thead><tr style="background:#f0f0f0; font-size:10px; color:#333;"><th>No</th><th>Name</th><th>MA 1</th><th>MA 2</th></tr></thead><tbody>`;
          for (let s = 0; s < 5; s++) {
            const val = slots[t * 5 + s];
            let p = null, isSub = false;
            if (typeof val === 'string') p = allMembers.find(m => m.uid === val);
            else if (val?.isSub) { p = val; isSub = true; }

            if (p) {
              const roleClass = `print-role-${(p.role || 'DPS').toLowerCase()}`;
              sideHtml += `<tr>
                <td style="text-align:center; width:20px;">${t * 5 + s + 1}</td>
                <td class="${roleClass}" style="font-weight:bold;">${p.name || p.loginUsername || 'Unknown'}</td>
                <td style="font-size:10px;">${isSub ? 'Sub' : (p.class1 || '-')}</td>
                <td style="font-size:10px;">${p.class2 || '-'}</td>
              </tr>`;
            } else {
              sideHtml += `<tr><td>${t * 5 + s + 1}</td><td></td><td></td><td></td></tr>`;
            }
          }
          sideHtml += `</tbody></table>`;
        }
        sideHtml += `</div></div>`;
        teamsHtml += sideHtml;
      });
      teamsHtml += `</div>`;
      return teamsHtml;
    };

    const fullHtmlForCategory = (cat, categoryHtml) => `
      <html>
      <head>
        <style>
          body { font-family: 'Arial', sans-serif; background: #fff; margin: 0; padding: 20px; display: flex; justify-content: center; }
          .print-area { background: #fff; color: #000; padding: 30px; width: 680px; text-align: center; }
          .print-area h1 { font-size: 28px; font-weight: 800; text-decoration: underline; margin-bottom: 24px; text-transform: uppercase; }
          .category-section { margin-bottom: 50px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
          .category-section h2 { font-size: 26px; color: #2c3e50; margin-bottom: 20px; text-align: left; border-left: 10px solid #2c3e50; padding-left: 15px; }
          .print-team { margin-bottom: 30px; }
          .print-team h3 { font-size: 18px; font-weight: 800; text-decoration: underline; margin-bottom: 12px; text-transform: uppercase; text-align: left; }
          .print-table { width: 100%; border-collapse: collapse; table-layout: fixed; flex: 1; }
          .print-table td, .print-table th { border: 1px solid #000; padding: 6px 4px; font-size: 10px; height: 28px; vertical-align: middle; text-align: center; }
          .print-role-dps { border-bottom: 4px solid #3498db !important; }
          .print-role-tank { border-bottom: 4px solid #e67e22 !important; }
          .print-role-healer { border-bottom: 4px solid #2ecc71 !important; }
        </style>
      </head>
      <body>
        <div class="print-area">
          <h1>GVG Roster — ${dayName}</h1>
          ${categoryHtml}
        </div>
      </body>
      </html>
    `;

    // 3. Render with Puppeteer
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // Send to specific channel if configured
    const targetChannel = await client.channels.fetch(ROSTER_CHANNEL_ID).catch(() => channel);
    const files = [];
    for (const category of categories) {
      const categoryHtml = buildCategoryHtml(category);
      if (!categoryHtml) continue;

      const page = await browser.newPage();
      await page.setViewport({ width: 850, height: 1500 });
      await page.setContent(fullHtmlForCategory(category, categoryHtml));

      const element = await page.$('.print-area');
      if (!element) {
        await page.close();
        throw new Error(`Roster area not found for ${category}`);
      }

      const buffer = await element.screenshot({ type: 'png' });
      await page.close();

      const attachment = new AttachmentBuilder(buffer, { name: `roster-update-${category.toLowerCase()}.png` });
      files.push(attachment);
    }

    if (files.length > 0) {
      await targetChannel.send({
        content: `📊 **Live Roster Update — ${dayName} (League + Ranked)**`,
        files
      });
    }

  } catch (error) {
    console.error("[Bot] PNG Gen Error:", error);
  } finally {
    if (browser) await browser.close();
  }
}

// ─── ATTENDANCE INTERACTION HANDLER ──────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && (interaction.customId.startsWith('league_') || interaction.customId.startsWith('ranked_'))) {
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (e) {
      console.error("Defer Error:", e);
      return;
    }

    const parts = interaction.customId.split('_');
    const type = parts[0]; // 'league' or 'ranked'
    const otherType = type === 'league' ? 'ranked' : 'league';
    const day = parts[1];  // 'sat' or 'sun'
    const mode = parts.slice(2).join('_'); // 'top_lane', 'mid_lane', etc.

    // Field name mapping: leagueSatMode, leagueSunMode, rankedSatMode, rankedSunMode
    const fieldName = `${type}${day.charAt(0).toUpperCase() + day.slice(1)}Mode`;
    const otherFieldName = `${otherType}${day.charAt(0).toUpperCase() + day.slice(1)}Mode`;

    const updates = {
      [`attendance.${fieldName}`]: mode,
      'attendance.lastUpdated': admin.firestore.FieldValue.serverTimestamp()
    };

    try {
      // Find the user by their Discord ID (string search)
      const snapshot = await db.collection('users').where('discordId', '==', interaction.user.id.toString()).get();

      if (snapshot.empty) {
        return interaction.editReply('❌ Your Discord account is not linked to any profile on the GVG website.');
      }

      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();

      // Block archived users from confirming attendance
      if (userData.isArchived === true) {
        return interaction.editReply('🚫 This account has been disabled by admins. Please contact a moderator if you believe this is a mistake.');
      }

      // Update with the correct field mapping
      await userDoc.ref.update(updates);

      // ==========================================
      // 5. ROSTER AUTO-SYNC & PNG
      // ==========================================
      try {
        await syncUserToRoster(userDoc.id, day, type, mode);

        // Trigger PNG update in the channel (async)
        generateRosterPNG(interaction.channel, day, type);
      } catch (e) {
        console.error("Roster Sync Error:", e);
      }

      // Fetch latest data for confirmation
      const updatedDoc = await userDoc.ref.get();
      const updatedData = updatedDoc.data();
      const att = updatedData.attendance || {};

      const formatMode = (m) => {
        if (!m || m === 'none') return 'NONE';
        if (m === 'top_lane') return 'TOP LANE';
        if (m === 'mid_lane') return 'MID LANE';
        if (m === 'bot_lane') return 'BOT LANE';
        if (m === 'flanker') return 'FLANKER';
        if (m === 'reserved') return 'RESERVED';
        return m.toUpperCase();
      };

      await interaction.editReply({
        content: `✅ **Attendance Updated!**\n\n` +
          `**League:** Sat: ${formatMode(att.leagueSatMode)} | Sun: ${formatMode(att.leagueSunMode)}\n` +
          `**Ranked:** Sat: ${formatMode(att.rankedSatMode)} | Sun: ${formatMode(att.rankedSunMode)}`,
        ephemeral: true
      });

      // ==========================================
      // WEBHOOK NOTIFICATION (Mimicking website)
      // ==========================================
      const WEBHOOK_URL = process.env.ATTENDANCE_WEBHOOK_URL;
      if (WEBHOOK_URL) {
        const message = `⚔️ **${userData.name}** updated their **${type.toUpperCase()}** attendance via Discord:\n` +
          `> **Day:** ${day.toUpperCase()}\n` +
          `> **Selection:** ${formatMode(mode)}`;

        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message })
        }).catch(err => console.error("Webhook Error:", err));
      }

    } catch (error) {
      console.error("Attendance Error:", error);
      await interaction.editReply('❌ Error updating database. Check bot logs.');
    }
  }

});

client.login(process.env.DISCORD_TOKEN);
