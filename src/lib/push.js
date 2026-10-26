export function triggerPushNotification(title, body, link) {
  // 1. Check if browser supports notifications and permission is granted
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body: body,
      icon: '/favicon.ico' // Or your Widebed brand mark icon
    });

    // Optional: Click the desktop push to jump to the page
    notification.onclick = () => {
      window.focus();
      if (link) {
        window.location.href = link;
      }
    };
  }
}