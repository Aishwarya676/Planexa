// service-worker.js

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: "Reminder", body: event.data.text() };
  }

  const title = data.title || "Reminder";
  const options = {
    body: data.body || "",
    icon: "/icon.png", // optional icon
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || "/")
  );
});
