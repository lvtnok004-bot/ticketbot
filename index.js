require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionsBitField, 
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

// THÊM THƯ VIỆN XUẤT TRANSCRIPT HTML
const discordTranscripts = require('discord-html-transcripts');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Bắt buộc có dòng này
  ],
});

// --- CẤU HÌNH ID KÊNH & ROLE HỆ THỐNG ---
const VOUCH_LOG_CHANNEL_ID = '1548557918977138779';       // Kênh bot gửi vouch
const ADMIN_REPORT_CHANNEL_ID = '1537333911095611443';    // Kênh nhận log Report Scammer
const TRANSCRIPT_LOG_CHANNEL_ID = '1548609339097481296'; // Kênh gửi transcript

// --- CẤU HÌNH ID ROLE ---
const HOANG_DE_ROLE_ID = '1456863702677459088';          // Role Hoàng Đế Thiên Hà (Owner)
const CHU_DE_CHE_ROLE_ID = '1548618704080736356';        // Role Chủ Đế Chế
const CHU_HE_MAT_TROI_ROLE_ID = '1548931132765114426';    // Role Chủ Hệ Mặt Trời
const TU_DAI_THIEN_VUONG_ROLE_ID = '1548930031550730371'; // Role Tứ Đại Thiên Vương
const THUONG_GIA_THIEN_HA_ROLE_ID = '1508249314781040770';// Role Thương Gia
const GDTG_STAFF_ROLE_ID = '1550121929162236034';         // Role Nhân viên GDTG

const MANAGER_ROLE_ID = '1437440890011521105';          // Role Manager (nếu dùng)
const SELLER_ROLE_ID = '1441449735192838245';            // Role Seller (nếu dùng)

// --- BỘ NHỚ LƯU TRỮ TẠM THỜI (DATABASE IN-MEMORY) ---
const ticketData = {};
const completedTickets = {};
const staffRatings = {};
const userDeposits = {};
const staffStats = {}; 
const ticketHistory = []; 

function createTicketEmbed(data) {
    let staffText = data.claimers && data.claimers.length > 0 
        ? `<@${data.claimers[0]}>` 
        : '⚡ *Chưa có ai nhận (Đang chờ)*';

    const embed = new EmbedBuilder()
        .setTitle(data.type === 'buy' ? '🛒 KÊNH TICKET MUA HÀNG / DỊCH VỤ' : '🎫 KÊNH TICKET GIAO DỊCH TRUNG GIAN (GDTG)')
        .setDescription(data.type === 'buy' 
            ? 'Cảm ơn bạn đã ủng hộ shop. Seller sẽ phản hồi và hỗ trợ bạn ngay lập tức!' 
            : 'Vui lòng đợi nhân viên GDTG vào tiếp nhận thông tin và hướng dẫn giao dịch an toàn.')
        .addFields(
            { name: '📋 Chi tiết / Thông tin', value: data.dealInfo },
            { name: '🙋‍♂️ Nhân viên phụ trách', value: staffText, inline: false }
        )
        .setColor(data.type === 'buy' ? '#00ffcc' : '#0099ff')
        .setTimestamp();

    return embed;
}

// --- HÀM TẠO VÀ GỬI TRANSCRIPT HTML ---
async function saveAndSendTranscript(channel, closedByUser) {
    try {
        const attachment = await discordTranscripts.createTranscript(channel, {
            limit: -1, 
            returnType: 'attachment',
            filename: `transcript-${channel.name}.html`,
            saveImages: true, 
            poweredBy: false
        });

        const transcriptChannel = channel.guild.channels.cache.get(TRANSCRIPT_LOG_CHANNEL_ID);
        if (transcriptChannel) {
            const embed = new EmbedBuilder()
                .setTitle("📁 NHẬT KÝ TRANSCRIPT TICKET")
                .setColor('#2F3136')
                .addFields(
                    { name: "Tên Kênh", value: `\`${channel.name}\``, inline: true },
                    { name: "Đóng bởi", value: `<@${closedByUser.id}>`, inline: true }
                )
                .setTimestamp();

            await transcriptChannel.send({ embeds: [embed], files: [attachment] });
        }
    } catch (e) {
        console.error("Lỗi khi xuất transcript HTML:", e);
    }
}

client.on('clientReady', () => {
    console.log(`Bot Discord đã khởi động thành công với tên: ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content === '!doanhthu') {
        const member = message.member;
        const isStaff = member.roles.cache.has(HOANG_DE_ROLE_ID) ||
                        member.roles.cache.has(MANAGER_ROLE_ID) ||
                        member.permissions.has(PermissionsBitField.Flags.Administrator);
        
        if (!isStaff) {
            return message.reply({ content: '❌ Bạn không có quyền sử dụng lệnh thống kê này!', ephemeral: true });
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const todayTickets = ticketHistory.filter(item => item.timestamp >= startOfToday.getTime());

        const userOpenCounts = {};
        todayTickets.forEach(item => {
            userOpenCounts[item.userId] = (userOpenCounts[item.userId] || 0) + 1;
        });

        const sortedUsers = Object.entries(userOpenCounts)
            .sort((a, b) => b[1] - a[1]);

        let userListDesc = sortedUsers.length > 0
            ? sortedUsers.map(([userId, count]) => `• <@${userId}>: **${count}** lần mở`).join('\n')
            : 'Chưa có ai mở ticket trong ngày hôm nay.';

        const doanhThuEmbed = new EmbedBuilder()
            .setTitle('📈 THỐNG KÊ TICKET TRONG NGÀY')
            .setDescription(`Báo cáo số liệu thống kê tính từ 00:00 hôm nay:`)
            .addFields(
                { name: '🎫 Tổng số ticket đã mở', value: `**${todayTickets.length}** ticket`, inline: false },
                { name: '👥 Chi tiết người mở ticket', value: userListDesc, inline: false }
            )
            .setColor('#2ecc71')
            .setTimestamp();

        return message.reply({ embeds: [doanhThuEmbed] });
    }

    if (message.content === '!thongke') {
        const sortedDeposits = Object.entries(userDeposits)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        let topDepositDesc = sortedDeposits.length > 0 
            ? sortedDeposits.map((item, index) => `**#${index + 1}** - <@${item[0]}>: **${item[1].toLocaleString('vi-VN')}** VNĐ`).join('\n')
            : 'Chưa có dữ liệu tiền cọc nào.';

        const sortedStaffDeals = Object.entries(staffStats)
            .sort((a, b) => b[1].completedDeals - a[1].completedDeals)
            .slice(0, 5);

        let topVouchDesc = sortedStaffDeals.length > 0
            ? sortedStaffDeals.map((item, index) => {
                const userId = item[0];
                const stats = item[1];
                const avg = stats.ratingCount > 0 ? (stats.totalStars / stats.ratingCount).toFixed(1) : '0.0';
                return `**#${index + 1}** - <@${userId}>: **${stats.completedDeals}** vouch | ⭐ **${avg}/5**`;
            }).join('\n')
            : 'Chưa có dữ liệu giao dịch nào.';

        const thongKeEmbed = new EmbedBuilder()
            .setTitle('📊 BẢNG THỐNG KÊ HỆ THỐNG GIAO DỊCH')
            .setDescription('Tổng hợp thông tin xếp hạng tiền cọc và uy tín nhân viên trong hệ thống:')
            .addFields(
                { name: '🏆 Top Tiền Cọc Cao Nhất', value: topDepositDesc, inline: false },
                { name: '🤝 Top Vouch & Đánh Giá Trung Bình', value: topVouchDesc, inline: false }
            )
            .setColor('#f1c40f')
            .setTimestamp();

        return message.reply({ embeds: [thongKeEmbed] });
    }

    if (message.content.startsWith('!chiso')) {
        const targetUser = message.mentions.users.first() || message.author;
        const deposit = userDeposits[targetUser.id] || 0;
        const stats = staffStats[targetUser.id] || { completedDeals: 0, totalStars: 0, ratingCount: 0 };
        
        let avgRating = stats.ratingCount > 0 ? (stats.totalStars / stats.ratingCount).toFixed(1) : 'Chưa có';
        let starDisplay = stats.ratingCount > 0 ? `${'⭐'.repeat(Math.round(avgRating))} (${avgRating}/5)` : 'Chưa có đánh giá';

        const statsEmbed = new EmbedBuilder()
            .setTitle(`📊 THÔNG TIN CHỈ SỐ GIAO DỊCH`)
            .setDescription(`Hồ sơ thống kê của thành viên <@${targetUser.id}>:`)
            .addFields(
                { name: '💎 Tổng tiền cọc hiện tại', value: `**${deposit.toLocaleString('vi-VN')}** VNĐ`, inline: false },
                { name: '🤝 Số kèo giao dịch thành công', value: `**${stats.completedDeals}** kèo`, inline: true },
                { name: '⭐ Đánh giá trung bình', value: starDisplay, inline: true }
            )
            .setColor('#3498db')
            .setTimestamp();

        return message.reply({ embeds: [statsEmbed] });
    }

    if (message.content.startsWith('!tiencoc')) {
        const member = message.member;
        const isStaff = member.roles.cache.has(HOANG_DE_ROLE_ID) ||
                        member.permissions.has(PermissionsBitField.Flags.Administrator);
        
        if (!isStaff) {
            return message.reply({ content: '❌ Bạn không có quyền sử dụng lệnh quản lý tiền cọc này!', ephemeral: true });
        }

        const args = message.content.split(' ').slice(1);
        const targetUser = message.mentions.users.first();
        if (!targetUser || args.length < 2) {
            return message.reply('❌ Sai cú pháp! Vui lòng sử dụng: `!tiencoc @user <số_tiền>` (Ví dụ: `!tiencoc @user 500k` hoặc `!tiencoc @user 2m`)');
        }

        let rawAmountStr = args.slice(1).join('').toLowerCase();
        let multiplier = 1;
        if (rawAmountStr.includes('k')) { 
            multiplier = 1000; 
            rawAmountStr = rawAmountStr.replace('k', ''); 
        } else if (rawAmountStr.includes('m')) { 
            multiplier = 1000000; 
            rawAmountStr = rawAmountStr.replace('m', ''); 
        }

        const numericValue = parseFloat(rawAmountStr);
        if (isNaN(numericValue)) {
            return message.reply('❌ Giá trị số tiền không hợp lệ! Vui lòng kiểm tra lại.');
        }

        const addedAmount = numericValue * multiplier;
        userDeposits[targetUser.id] = (userDeposits[targetUser.id] || 0) + addedAmount;

        const successEmbed = new EmbedBuilder()
            .setTitle('💰 CẬP NHẬT TIỀN CỌC GIAO DỊCH')
            .setDescription(`Đã cập nhật số dư tiền cọc cho thành viên <@${targetUser.id}>.`)
            .addFields(
                { name: '➕ Số tiền thay đổi', value: `${addedAmount.toLocaleString('vi-VN')} VNĐ`, inline: true },
                { name: '💎 Tổng tiền cọc hiện tại', value: `**${userDeposits[targetUser.id].toLocaleString('vi-VN')}** VNĐ`, inline: true }
            )
            .setColor('#00ffcc')
            .setTimestamp();

        return message.reply({ embeds: [successEmbed] });
    }

    if (message.content.startsWith('!checkcoc')) {
        const targetUser = message.mentions.users.first() || message.author;
        const currentDeposit = userDeposits[targetUser.id] || 0;

        const checkEmbed = new EmbedBuilder()
            .setTitle('🔍 THÔNG TIN TIỀN CỌC')
            .setDescription(`Số tiền cọc hiện tại của <@${targetUser.id}> là: **${currentDeposit.toLocaleString('vi-VN')}** VNĐ`)
            .setColor('#3498db')
            .setTimestamp();

        return message.reply({ embeds: [checkEmbed] });
    }

    if (message.content === '!setup-ticket' || message.content === '!setup') {
        const embed = new EmbedBuilder()
            .setTitle('🎫 HỆ THỐNG TICKET DỊCH VỤ & HỖ TRỢ TRUNG TÂM')
            .setDescription(`>>> Bạn cần gdtg hãy mở ticket ở đây
:verify~3: Bạn cần mua bán
:verify~3: Nếu bạn có vấn đề thắc mắc cần giải đáp
:verify~3: Bn cần GDTG (game,var,all)
Vui lòng tạo ticket

:chamthang~2: XIN LƯU Ý
:chamthang~2: Hãy nói rõ mặt hàng bạn cần mua/hỗ trợ sau khi tạo ticket
:chamthang~2: Vui lòng không tạo ticket nếu bạn không có nhu cầu/ vấn đề gì cần giúp đỡ
:chamthang~2: Không ping quá nhiều khi đã tạo ticket`)
            .setColor('#0099ff')
            .setFooter({ text: 'Hệ thống tự động quản lý ticket' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('create_gdtg_ticket').setLabel('Tạo Ticket GDTG').setStyle(ButtonStyle.Primary).setEmoji('📩'),
            new ButtonBuilder().setCustomId('create_buy_ticket').setLabel('Mua Hàng').setStyle(ButtonStyle.Success).setEmoji('🛒'),
            new ButtonBuilder().setCustomId('create_report_ticket').setLabel('Report Scammer').setStyle(ButtonStyle.Danger).setEmoji('🚨')
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        return message.delete().catch(() => {});
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {

        if (interaction.customId === 'create_gdtg_ticket') {
            const modal = new ModalBuilder().setCustomId('modal_gdtg_form').setTitle('📋 THÔNG TIN GIAO DỊCH TRUNG GIAN');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('deal_person').setLabel('1. Tên người cần giao dịch cùng').setStyle(TextInputStyle.Short).setPlaceholder('Nhập tên hoặc mention người mua/bán...').setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('deal_item').setLabel('2. Tài sản / Đồ cần giao dịch').setStyle(TextInputStyle.Short).setPlaceholder('Ví dụ: Acc Blox Fruits, 500k Robux...').setRequired(true)
                )
            );
            await interaction.showModal(modal);
        }

        if (interaction.customId === 'create_buy_ticket') {
            const modal = new ModalBuilder().setCustomId('modal_buy_form').setTitle('🛒 THÔNG TIN MUA HÀNG');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('buy_item').setLabel('Sản phẩm / Dịch vụ muốn mua').setStyle(TextInputStyle.Short).setPlaceholder('Nhập tên sản phẩm bạn muốn đặt mua...').setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('buy_note').setLabel('Ghi chú thêm cho Seller').setStyle(TextInputStyle.Short).setPlaceholder('Ví dụ: Server, thời gian nhận, yêu cầu riêng...').setRequired(false)
                )
            );
            await interaction.showModal(modal);
        }

        if (interaction.customId === 'create_report_ticket') {
            const modal = new ModalBuilder().setCustomId('modal_report_form').setTitle('🚨 REPORT SCAMMER');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('scammer_name').setLabel('Tên hoặc ID đối tượng bị tố cáo').setStyle(TextInputStyle.Short).setPlaceholder('Nhập tên/link/ID Discord kẻ lừa đảo...').setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('scammer_proof').setLabel('Mô tả chi tiết sự việc').setStyle(TextInputStyle.Paragraph).setPlaceholder('Mô tả sự việc. Bạn có thể gửi ảnh/video trực tiếp vào kênh ticket sau khi tạo!').setRequired(true)
                )
            );
            await interaction.showModal(modal);
        }

        if (interaction.customId === 'claim_ticket') {
            const member = interaction.member;
            const isStaff = member.roles.cache.has(GDTG_STAFF_ROLE_ID) || 
                            member.roles.cache.has(SELLER_ROLE_ID) || 
                            member.roles.cache.has(HOANG_DE_ROLE_ID) || 
                            member.roles.cache.has(MANAGER_ROLE_ID) || 
                            member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Chỉ có Nhân viên GDTG, Seller hoặc Quản trị viên mới có thể nhận ticket này!', ephemeral: true });
            }

            const channel = interaction.channel;
            const staff = interaction.user;
            
            if (!ticketData[channel.id]) {
                ticketData[channel.id] = { type: 'gdtg', claimers: [], dealInfo: 'Không có thông tin' };
            }

            if (ticketData[channel.id].claimers && ticketData[channel.id].claimers.length > 0) {
                const currentClaimerId = ticketData[channel.id].claimers[0];
                if (currentClaimerId !== staff.id) {
                    return interaction.reply({ 
                        content: `❌ Ticket này hiện đang được phụ trách bởi <@${currentClaimerId}> rồi! Bạn không thể nhận đè trừ khi nhân viên đó bấm hủy hoặc chuyển giao.`, 
                        ephemeral: true 
                    });
                } else {
                    return interaction.reply({ content: `⚠️ Bạn đã là người tiếp nhận ticket này từ trước rồi!`, ephemeral: true });
                }
            }

            ticketData[channel.id].claimers = [staff.id];

            try {
                if (ticketData[channel.id].messageId) {
                    const botMessage = await channel.messages.fetch(ticketData[channel.id].messageId);
                    if (botMessage) {
                        await botMessage.edit({ embeds: [createTicketEmbed(ticketData[channel.id])] });
                    }
                }
            } catch (err) {
                console.error('Không thể cập nhật tin nhắn gốc:', err);
            }

            await channel.send({ content: `📢 Nhân viên <@${staff.id}> đã tiếp nhận xử lý ticket này!` });

            return interaction.reply({ content: `✅ Bạn đã chính thức tiếp nhận ticket này!`, ephemeral: true });
        }

        if (interaction.customId === 'unclaim_ticket') {
            const channel = interaction.channel;
            const staff = interaction.user;

            if (!ticketData[channel.id] || !ticketData[channel.id].claimers || !ticketData[channel.id].claimers.includes(staff.id)) {
                return interaction.reply({ content: '❌ Bạn chưa nhận ticket này nên không thể hủy nhận!', ephemeral: true });
            }

            ticketData[channel.id].claimers = [];

            try {
                if (ticketData[channel.id].messageId) {
                    const botMessage = await channel.messages.fetch(ticketData[channel.id].messageId);
                    if (botMessage) {
                        await botMessage.edit({ embeds: [createTicketEmbed(ticketData[channel.id])] });
                    }
                }
            } catch (err) {
                console.error('Không thể cập nhật tin nhắn gốc:', err);
            }

            await channel.send({ content: `⚠️ Nhân viên <@${staff.id}> đã hủy tiếp nhận ticket này. Ticket đang ở trạng thái chờ nhân viên khác.` });

            return interaction.reply({ content: `🔄 Bạn đã hủy tiếp nhận ticket này thành công!`, ephemeral: true });
        }

        if (interaction.customId === 'transfer_ticket') {
            const channel = interaction.channel;
            const staff = interaction.user;

            if (!ticketData[channel.id] || !ticketData[channel.id].claimers || !ticketData[channel.id].claimers.includes(staff.id)) {
                return interaction.reply({ content: '❌ Bạn phải là người đang nhận ticket này mới có thể chuyển cho người khác!', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('submit_transfer_ticket')
                .setTitle('Chuyển Ticket Cho Nhân Viên Khác');

            const transferInput = new TextInputBuilder()
                .setCustomId('new_staff_id')
                .setLabel("Nhập ID hoặc Tag nhân viên nhận thay")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Nhập ID hoặc tag tên nhân viên mới...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(transferInput));
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'add_member_modal') {
            const member = interaction.member;
            const isStaff = member.roles.cache.has(GDTG_STAFF_ROLE_ID) || 
                            member.roles.cache.has(SELLER_ROLE_ID) || 
                            member.roles.cache.has(HOANG_DE_ROLE_ID) || 
                            member.roles.cache.has(MANAGER_ROLE_ID) || 
                            member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Chỉ có Nhân viên GDTG, Seller hoặc Quản trị viên mới có quyền thêm người vào ticket!', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('submit_add_member')
                .setTitle('Thêm người vào Ticket');

            const userInput = new TextInputBuilder()
                .setCustomId('target_user_id')
                .setLabel("Nhập ID hoặc Tag của người cần thêm")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ví dụ: 123456789012345678')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(userInput));
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'close_ticket') {
            const channel = interaction.channel;
            const data = ticketData[channel.id] || {};
            const member = interaction.member;
            
            const isStaff = member.roles.cache.has(GDTG_STAFF_ROLE_ID) || 
                            member.roles.cache.has(SELLER_ROLE_ID) ||
                            member.roles.cache.has(HOANG_DE_ROLE_ID) || 
                            member.roles.cache.has(MANAGER_ROLE_ID) || 
                            member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Chỉ có nhân viên mới có quyền bấm nút đóng vé này!', ephemeral: true });
            }

            const optionsEmbed = new EmbedBuilder()
                .setTitle('🔒 TÙY CHỌN ĐÓNG KÊNH TICKET')
                .setDescription('Bạn có muốn đánh giá chất lượng dịch vụ trước khi đóng vé này không?')
                .setColor('#ffaa00');

            const optionsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_instant').setLabel('Đóng Ngay Lập Tức').setStyle(ButtonStyle.Danger).setEmoji('🚪'),
                new ButtonBuilder().setCustomId(data.type === 'buy' ? 'open_buy_rating' : 'open_rating_panel').setLabel('Đánh Giá Dịch Vụ').setStyle(ButtonStyle.Success).setEmoji('⭐')
            );
            return interaction.reply({ embeds: [optionsEmbed], components: [optionsRow], ephemeral: true });
        }

        if (interaction.customId === 'close_instant') {
            const channel = interaction.channel;
            
            await interaction.reply({ content: '🚪 Đang tiến hành lưu transcript và đóng vé ngay lập tức...', ephemeral: true });
            
            await saveAndSendTranscript(channel, interaction.user);

            delete ticketData[channel.id];
            
            setTimeout(() => channel.delete().catch(() => {}), 2000);
        }

        if (interaction.customId === 'open_rating_panel') {
            const channel = interaction.channel;
            
            await interaction.update({ content: '✅ Đã hiển thị bảng đánh giá GDTG trong kênh:', embeds: [], components: [] });
            
            const ratingEmbed = new EmbedBuilder()
                .setTitle('⭐ ĐÁNH GIÁ DỊCH VỤ GDTG')
                .setDescription('Vui lòng chọn số sao tương ứng với độ hài lòng của bạn đối với nhân viên phụ trách:')
                .setColor('#ffcc00');

            const ratingRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('rate_gdtg_1').setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('rate_gdtg_2').setLabel('⭐⭐ 2').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('rate_gdtg_3').setLabel('⭐⭐⭐ 3').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('rate_gdtg_4').setLabel('⭐⭐⭐⭐ 4').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('rate_gdtg_5').setLabel('⭐⭐⭐⭐⭐ 5').setStyle(ButtonStyle.Success),
            );
            await channel.send({ embeds: [ratingEmbed], components: [ratingRow] });
        }

        if (interaction.customId === 'open_buy_rating') {
            const channel = interaction.channel;
            
            await interaction.update({ content: '✅ Đã hiển thị bảng đánh giá Mua Hàng trong kênh:', embeds: [], components: [] });
            
            const ratingEmbed = new EmbedBuilder()
                .setTitle('🛒 ĐÁNH GIÁ DỊCH VỤ MUA HÀNG')
                .setDescription('Vui lòng chọn số sao để đánh giá sản phẩm và trải nghiệm mua hàng:')
                .setColor('#00ffcc');

            const ratingRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('rate_buy_1').setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('rate_buy_2').setLabel('⭐⭐ 2').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('rate_buy_3').setLabel('⭐⭐⭐ 3').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('rate_buy_4').setLabel('⭐⭐⭐⭐ 4').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('rate_buy_5').setLabel('⭐⭐⭐⭐⭐ 5').setStyle(ButtonStyle.Success),
            );
            await channel.send({ embeds: [ratingEmbed], components: [ratingRow] });
        }

        if (interaction.customId.startsWith('rate_gdtg_')) {
            const channel = interaction.channel;
            const data = ticketData[channel.id] || {};
            const userId = interaction.user.id;

            const isOpener = data.openerId ? userId === data.openerId : userId === channel.permissionOverwrites.cache.find(p => p.type === 1)?.id;
            if (!isOpener) {
                return interaction.reply({ content: '❌ Chỉ có người mở ticket mới có quyền bấm chọn số sao đánh giá!', ephemeral: true });
            }

            const stars = interaction.customId.split('_')[2];
            const modal = new ModalBuilder().setCustomId(`modal_review_gdtg_${stars}`).setTitle(`Nhận xét GDTG (${stars} Sao)`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('review_text').setLabel('Lời nhận xét chi tiết:').setStyle(TextInputStyle.Paragraph).setPlaceholder('Nhập cảm nhận của bạn về giao dịch này...').setRequired(true)
                )
            );
            await interaction.showModal(modal);
        }

        if (interaction.customId.startsWith('rate_buy_')) {
            const channel = interaction.channel;
            const data = ticketData[channel.id] || {};
            const userId = interaction.user.id;

            const isOpener = data.openerId ? userId === data.openerId : userId === channel.permissionOverwrites.cache.find(p => p.type === 1)?.id;
            if (!isOpener) {
                return interaction.reply({ content: '❌ Chỉ có người mở ticket mới có quyền bấm chọn số sao đánh giá!', ephemeral: true });
            }

            const stars = interaction.customId.split('_')[2];
            const modal = new ModalBuilder().setCustomId(`modal_review_buy_${stars}`).setTitle(`Nhận xét Mua Hàng (${stars} Sao)`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('review_text').setLabel('Nhận xét về sản phẩm/dịch vụ:').setStyle(TextInputStyle.Paragraph).setPlaceholder('Nhập đánh giá sản phẩm của shop...').setRequired(true)
                )
            );
            await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit()) {

        if (interaction.customId === 'submit_add_member') {
            let rawInput = interaction.fields.getTextInputValue('target_user_id').trim();
            const targetId = rawInput.replace(/<@!?&?(\d+)>/g, '$1').replace(/[^0-9]/g, '');
            const channel = interaction.channel;

            try {
                let targetMember = null;
                if (targetId.length >= 17) {
                    targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                }
                if (!targetMember) {
                    const fetchedMembers = await interaction.guild.members.fetch({ query: rawInput, limit: 1 });
                    targetMember = fetchedMembers.first();
                }
                
                if (!targetMember) {
                    return interaction.reply({ content: `❌ Không tìm thấy thành viên **"${rawInput}"** trong Server! Vui lòng thử dùng ID chính xác.`, ephemeral: true });
                }

                await channel.permissionOverwrites.create(targetMember, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                });

                return interaction.reply({ content: `✅ Đã thêm thành công ${targetMember} vào ticket này!`, ephemeral: false });
            } catch (err) {
                console.error(err);
                return interaction.reply({ content: '❌ Có lỗi xảy ra khi tìm thành viên, vui lòng kiểm tra lại thông tin!', ephemeral: true });
            }
        }

        if (interaction.customId === 'submit_transfer_ticket') {
            let rawInput = interaction.fields.getTextInputValue('new_staff_id').trim();
            const targetId = rawInput.replace(/<@!?&?(\d+)>/g, '$1').replace(/[^0-9]/g, '');
            const channel = interaction.channel;
            const oldStaffId = interaction.user.id;

            let newStaffMember = null;
            try {
                if (targetId.length >= 17) {
                    newStaffMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                }
                if (!newStaffMember) {
                    const fetchedMembers = await interaction.guild.members.fetch({ query: rawInput, limit: 1 });
                    newStaffMember = fetchedMembers.first();
                }
            } catch (err) {
                console.error(err);
            }

            if (!newStaffMember) {
                return interaction.reply({ content: `❌ Không tìm thấy nhân viên **"${rawInput}"** trong server! Vui nhập đúng ID hoặc tag tên.`, ephemeral: true });
            }

            if (!ticketData[channel.id]) ticketData[channel.id] = { claimers: [] };
            
            ticketData[channel.id].claimers = [newStaffMember.id];

            try {
                if (ticketData[channel.id].messageId) {
                    const botMessage = await channel.messages.fetch(ticketData[channel.id].messageId);
                    if (botMessage) {
                        await botMessage.edit({ embeds: [createTicketEmbed(ticketData[channel.id])] });
                    }
                }
            } catch (err) {
                console.error('Không thể cập nhật tin nhắn gốc:', err);
            }

            await channel.send({ content: `➡️ Nhân viên <@${oldStaffId}> đã chuyển ticket này sang cho <@${newStaffMember.id}> tiếp tục xử lý!` });

            return interaction.reply({ content: `➡️ Đã chuyển ticket thành công sang cho ${newStaffMember}!`, ephemeral: false });
        }
        
        if (interaction.customId === 'modal_gdtg_form') {
            const guild = interaction.guild;
            const user = interaction.user;
            const dealPerson = interaction.fields.getTextInputValue('deal_person');
            const dealItem = interaction.fields.getTextInputValue('deal_item');

            await interaction.deferReply({ ephemeral: true });

            const channel = await guild.channels.create({
                name: `gdtg-${user.username}`,
                type: ChannelType.GuildText,
                parent: '1520449019120451724',
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: HOANG_DE_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: GDTG_STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: MANAGER_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                ],
            });

            const embed = createTicketEmbed({
                type: 'gdtg',
                claimers: [],
                dealInfo: `• Đối tác giao dịch: ${dealPerson}\n• Tài sản/Đồ giao dịch: ${dealItem}`
            });

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('claim_ticket').setLabel('Nhận Ticket').setStyle(ButtonStyle.Success).setEmoji('🙋‍♂️'),
                new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Hủy Nhận').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('transfer_ticket').setLabel('Chuyển Ticket').setStyle(ButtonStyle.Primary).setEmoji('➡️')
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('add_member_modal').setLabel('Thêm Người').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Đóng Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );

            // --- PING TICKET GDTG ---
            const gdtgPingContent = `<@${user.id}> | <@&${HOANG_DE_ROLE_ID}> \vert{} <@&${CHU_DE_CHE_ROLE_ID}> | <@&${CHU_HE_MAT_TROI_ROLE_ID}> \vert{} <@&${TU_DAI_THIEN_VUONG_ROLE_ID}> | <@&${THUONG_GIA_THIEN_HA_ROLE_ID}> \vert{} <@&${GDTG_STAFF_ROLE_ID}>`;

            const sentMsg = await channel.send({ 
                content: gdtgPingContent, 
                embeds: [embed], 
                components: [row1, row2] 
            });

            ticketData[channel.id] = {
                type: 'gdtg',
                openerId: user.id,
                opener: `<@${user.id}>`,
                claimers: [],
                dealInfo: `• Đối tác giao dịch: ${dealPerson}\n• Tài sản/Đồ giao dịch: ${dealItem}`,
                messageId: sentMsg.id
            };

            ticketHistory.push({
                userId: user.id,
                timestamp: Date.now()
            });

            await interaction.editReply({ content: `✅ Đã khởi tạo thành công ticket GDTG tại kênh: ${channel}` });
        }

        if (interaction.customId === 'modal_buy_form') {
            const guild = interaction.guild;
            const user = interaction.user;
            const buyItem = interaction.fields.getTextInputValue('buy_item');
            const buyNote = interaction.fields.getTextInputValue('buy_note') || 'Không có ghi chú';

            await interaction.deferReply({ ephemeral: true });

            const channel = await guild.channels.create({
                name: `muahang-${user.username}`,
                type: ChannelType.GuildText,
                parent: '1437994731635216434',
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: SELLER_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: HOANG_DE_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: MANAGER_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                ],
            });

            const embed = createTicketEmbed({
                type: 'buy',
                claimers: [],
                dealInfo: `• Sản phẩm: ${buyItem}\n• Ghi chú: ${buyNote}`
            });

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('claim_ticket').setLabel('Tiếp Nhận Đơn').setStyle(ButtonStyle.Success).setEmoji('🛒'),
                new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Hủy Nhận').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('transfer_ticket').setLabel('Chuyển Ticket').setStyle(ButtonStyle.Primary).setEmoji('➡️')
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('add_member_modal').setLabel('Thêm Người').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Đóng Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );

            // --- PING TICKET MUA HÀNG ---
            const buyPingContent = `<@${user.id}> | <@&${HOANG_DE_ROLE_ID}> \vert{} <@&${CHU_DE_CHE_ROLE_ID}> | <@&${CHU_HE_MAT_TROI_ROLE_ID}> \vert{} <@&${TU_DAI_THIEN_VUONG_ROLE_ID}>`;

            const sentMsg = await channel.send({ 
                content: buyPingContent, 
                embeds: [embed], 
                components: [row1, row2] 
            });

            ticketData[channel.id] = {
                type: 'buy',
                openerId: user.id,
                opener: `<@${user.id}>`,
                claimers: [],
                dealInfo: `• Sản phẩm: ${buyItem}\n• Ghi chú: ${buyNote}`,
                messageId: sentMsg.id
            };

            ticketHistory.push({
                userId: user.id,
                timestamp: Date.now()
            });

            await interaction.editReply({ content: `✅ Đã khởi tạo thành công ticket Mua Hàng tại kênh: ${channel}` });
        }

        if (interaction.customId === 'modal_report_form') {
            const guild = interaction.guild;
            const user = interaction.user;
            const scammerName = interaction.fields.getTextInputValue('scammer_name');
            const scammerProof = interaction.fields.getTextInputValue('scammer_proof');

            await interaction.deferReply({ ephemeral: true });

            const channel = await guild.channels.create({
                name: `report-${user.username}`,
                type: ChannelType.GuildText,
                parent: '1437994731635216434',
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: HOANG_DE_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: MANAGER_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                ],
            });

            const reportEmbed = new EmbedBuilder()
                .setTitle('🚨 KHIẾU NẠI KHẨN CẤP / REPORT SCAMMER')
                .addFields(
                    { name: '👤 Người báo cáo', value: `<@${user.id}>`, inline: true },
                    { name: '🎯 Đối tượng bị tố cáo', value: scammerName, inline: true },
                    { name: '📄 Bằng chứng chi tiết', value: `\`\`\`${scammerProof}\`\`\``, inline: false }
                )
                .setColor('#ff0000')
                .setTimestamp();

            client.channels.fetch(ADMIN_REPORT_CHANNEL_ID).then(ownerChannel => {
                if (ownerChannel) {
                    ownerChannel.send({ content: `<@&${HOANG_DE_ROLE_ID}> Có report lừa đảo / sự cố khẩn cấp mới từ khách hàng!`, embeds: [reportEmbed] });
                }
            }).catch(err => {
                console.error('Không thể gửi log báo cáo đến kênh quản lý:', err);
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_instant').setLabel('Đóng Ngay Kênh Report').setStyle(ButtonStyle.Danger).setEmoji('🚪')
            );

            // --- PING TICKET REPORT ---
            const reportPingContent = `<@${user.id}> | <@&${HOANG_DE_ROLE_ID}> | <@&${CHU_DE_CHE_ROLE_ID}> | <@&${CHU_HE_MAT_TROI_ROLE_ID}> | <@&${TU_DAI_THIEN_VUONG_ROLE_ID}>`;

            await channel.send({ 
                content: reportPingContent, 
                embeds: [reportEmbed], 
                components: [row] 
            });

            ticketHistory.push({
                userId: user.id,
                timestamp: Date.now()
            });

            await interaction.editReply({ content: `✅ Đã tiếp nhận khiếu nại và tạo kênh thành công: ${channel}` });
        }

        if (interaction.customId.startsWith('modal_review_gdtg_')) {
            const stars = Number(interaction.customId.split('_')[3]);
            const reviewContent = interaction.fields.getTextInputValue('review_text');
            const channel = interaction.channel;
            const data = ticketData[channel.id] || { opener: 'Không rõ', claimers: [], dealInfo: 'Không có thông tin' };

            if (data.claimers && data.claimers.length > 0) {
                data.claimers.forEach(staffId => {
                    if (!staffStats[staffId]) {
                        staffStats[staffId] = { completedDeals: 0, totalStars: 0, ratingCount: 0 };
                    }
                    staffStats[staffId].completedDeals += 1;
                    staffStats[staffId].totalStars += stars;
                    staffStats[staffId].ratingCount += 1;

                    staffRatings[staffId] = staffStats[staffId].completedDeals;
                });
            }

            let claimersText = data.claimers && data.claimers.length > 0 
                ? data.claimers.map(id => `<@${id}>`).join(', ') 
                : 'Chưa có';

            let staffIdForVouch = (data.claimers && data.claimers.length > 0) ? data.claimers[0] : null;
            let totalVouchText = staffIdForVouch 
                ? `<@${staffIdForVouch}>: **${staffStats[staffIdForVouch] ? staffStats[staffIdForVouch].completedDeals : 1}** vouch` 
                : 'Không có';

            await interaction.reply({ content: `🎉 Cảm ơn bạn đã gửi đánh giá dịch vụ GDTG! Kênh ticket sẽ tự động lưu file html và đóng sau vài giây...`, ephemeral: false });

            try {
                const vouchChannel = await client.channels.fetch(VOUCH_LOG_CHANNEL_ID);
                if (vouchChannel) {
                    const vouchEmbed = new EmbedBuilder()
                        .setTitle('📊 VOUCH & ĐÁNH GIÁ GIAO DỊCH TRUNG GIAN (GDTG)')
                        .addFields(
                            { name: '👤 Người mở ticket', value: data.opener || `<@${interaction.user.id}>`, inline: true },
                            { name: '🙋‍♂️ Nhân viên phụ trách', value: claimersText, inline: true },
                            { name: '📋 Thông tin giao dịch', value: data.dealInfo, inline: false },
                            { name: '⭐ Đánh giá chi tiết', value: `${'⭐'.repeat(stars)} (${stars}/5 Sao)`, inline: true },
                            { name: '💬 Lời nhận xét từ khách', value: reviewContent, inline: false },
                            { name: '📈 Tổng số vouch', value: totalVouchText, inline: false }
                        )
                        .setColor('#00ffcc')
                        .setTimestamp();
                    await vouchChannel.send({ embeds: [vouchEmbed] });
                }
            } catch (err) { 
                console.error('Lỗi khi gửi vouch log GDTG:', err); 
            }

            await saveAndSendTranscript(channel, interaction.user);

            delete ticketData[channel.id];
            setTimeout(() => channel.delete().catch(() => {}), 3000);
        }

        if (interaction.customId.startsWith('modal_review_buy_')) {
            const stars = Number(interaction.customId.split('_')[3]);
            const reviewContent = interaction.fields.getTextInputValue('review_text');
            const channel = interaction.channel;
            const data = ticketData[channel.id] || { opener: 'Không rõ', claimers: [], dealInfo: 'Không có thông tin' };

            if (data.claimers && data.claimers.length > 0) {
                data.claimers.forEach(staffId => {
                    staffRatings[staffId] = (staffRatings[staffId] || 0) + 1;
                    
                    if (!staffStats[staffId]) staffStats[staffId] = { completedDeals: 0, totalStars: 0, ratingCount: 0 };
                    staffStats[staffId].completedDeals += 1;
                    staffStats[staffId].totalStars += stars;
                    staffStats[staffId].ratingCount += 1;
                });
            }

            let claimersText = data.claimers && data.claimers.length > 0 
                ? data.claimers.map(id => `<@${id}>`).join(', ') 
                : 'Chưa có';

            let staffIdForVouch = (data.claimers && data.claimers.length > 0) ? data.claimers[0] : null;
            let totalVouchText = staffIdForVouch 
                ? `<@${staffIdForVouch}>: **${staffRatings[staffIdForVouch] || 1}** vouch` 
                : 'Không có';

            await interaction.reply({ content: `🎉 Cảm ơn bạn đã đánh giá dịch vụ Mua Hàng! Kênh ticket sẽ tự động lưu file html và đóng sau vài giây...`, ephemeral: false });

            try {
                const vouchChannel = await client.channels.fetch(VOUCH_LOG_CHANNEL_ID);
                if (vouchChannel) {
                    const vouchEmbed = new EmbedBuilder()
                        .setTitle('🛒 VOUCH & ĐÁNH GIÁ MUA HÀNG / DỊCH VỤ')
                        .addFields(
                            { name: '👤 Khách hàng mua', value: data.opener || `<@${interaction.user.id}>`, inline: true },
                            { name: '🛡️ Staff / Seller phụ trách', value: claimersText, inline: true },
                            { name: '📦 Thông tin sản phẩm', value: data.dealInfo, inline: false },
                            { name: '⭐ Đánh giá chất lượng', value: `${'⭐'.repeat(stars)} (${stars}/5 Sao)`, inline: true },
                            { name: '💬 Nhận xét sản phẩm', value: reviewContent, inline: false },
                            { name: '📈 Tổng số vouch', value: totalVouchText, inline: false }
                        )
                        .setColor('#ffaa00')
                        .setTimestamp();
                    await vouchChannel.send({ embeds: [vouchEmbed] });
                }
            } catch (err) { 
                console.error('Lỗi khi gửi vouch log mua hàng:', err); 
            }

            await saveAndSendTranscript(channel, interaction.user);

            delete ticketData[channel.id];
            setTimeout(() => channel.delete().catch(() => {}), 3000);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);