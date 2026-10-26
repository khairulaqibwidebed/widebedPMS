<template>
  <main class="content">
    <div class="page-head">
      <div>
        <h1>Notifications</h1>
        <div class="sub">System alerts, tickets, and updates</div>
      </div>
      <div class="head-tools">
        <button class="btn secondary" @click="markAllAsRead">Mark all as read</button>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.id" 
        :class="{ active: currentTab === tab.id }"
        @click="currentTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Notifications List -->
    <div class="notifications-list">
      <div 
        v-for="item in filteredNotifications" 
        :key="item.id" 
        class="notification-card"
        :class="{ unread: !item.read }"
        @click="handleNotificationClick(item)"
      >
        <div class="notification-icon">
          <span>{{ getTypeIcon(item.type) }}</span>
        </div>
        <div class="notification-content">
          <div class="notification-title-row">
            <h3>{{ item.title }}</h3>
            <span class="time">{{ item.timestamp }}</span>
          </div>
          <p>{{ item.message }}</p>
        </div>
        <div class="notification-action">
          <span class="chev">›</span>
        </div>
      </div>

      <div v-if="filteredNotifications.length === 0" class="empty-state">
        <p>No notifications found.</p>
      </div>
    </div>
  </main>
</template>

<script>
export default {
  data() {
    return {
      currentTab: 'all',
      tabs: [
        { id: 'all', label: 'All' },
        { id: 'unread', label: 'Unread' },
        { id: 'maintenance', label: 'Maintenance' },
        { id: 'frontdesk', label: 'Front Desk' },
        { id: 'housekeeping', label: 'Housekeeping' }
      ],
      notifications: [
        {
          id: 1,
          type: 'maintenance',
          title: 'New Maintenance Ticket',
          message: 'AC not cooling reported in Room 302 by Housekeeping.',
          timestamp: '10 mins ago',
          read: false,
          link: '/Operations/issues'
        },
        {
          id: 2,
          type: 'frontdesk',
          title: 'Booking Modified',
          message: 'Guest John Doe extended stay.',
          timestamp: '1 hour ago',
          read: false,
          link: '/Portfolio/bookings'
        },
        {
          id: 3,
          type: 'housekeeping',
          title: 'Room Ready',
          message: 'Room 104 cleaned and inspected.',
          timestamp: '3 hours ago',
          read: true,
          link: '/Operations/issues'
        }
      ]
    };
  },
  computed: {
    filteredNotifications() {
      if (this.currentTab === 'unread') return this.notifications.filter(n => !n.read);
      if (this.currentTab !== 'all') return this.notifications.filter(n => n.type === this.currentTab);
      return this.notifications;
    }
  },
  methods: {
    getTypeIcon(type) {
      const icons = { maintenance: '🔧', frontdesk: '🛎️', housekeeping: '🧹' };
      return icons[type] || '📌';
    },
    markAllAsRead() {
      this.notifications.forEach(n => n.read = true);
    },
    handleNotificationClick(item) {
      item.read = true;
      if (item.link) {
        this.$router.push(item.link);
      }
    }
  }
};
</script>

<style scoped>
.notifications-page { padding: 24px; max-width: 900px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.filter-tabs { display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid rgba(128,128,128,0.2); padding-bottom: 8px; }
.filter-tabs button { background: none; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 500; color: inherit; }
.filter-tabs button.active { background: rgba(128, 128, 128, 0.15); font-weight: 600; }
.notifications-list { display: flex; flex-direction: column; gap: 10px; }
.notification-card { display: flex; align-items: center; gap: 16px; padding: 14px 18px; background: #fff; border: 1px solid rgba(128,128,128,0.2); border-radius: 10px; cursor: pointer; transition: background 0.2s; }
.notification-card:hover { background: rgba(128,128,128,0.04); }
.notification-card.unread { border-left: 4px solid var(--primary, #0066cc); background: rgba(0, 102, 204, 0.02); }
.notification-content { flex: 1; }
.notification-title-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
.notification-title-row h3 { font-size: 15px; margin: 0; }
.time { font-size: 12px; color: #666; }
.notification-content p { margin: 0; font-size: 14px; color: #444; }
.empty-state { text-align: center; padding: 40px; color: #666; }
.chev { font-size: 18px; color: #888; }
</style>