const knowledgeBase = [
  // ------------------- SAFETY & COMPLIANCE -------------------
  {
    question: "Harassment or safety concerns",
    answer: "If you experience harassment or any safety-related issue on the platform, please report it immediately to purplehue@gmail.com."
  },
  {
    question: "Complaints",
    answer: "For any complaints regarding the platform or services, please email purplehue@gmail.com with full details."
  },
  {
    question: "How do I report a security issue?",
    answer: "If you found a security concern, vulnerability, or bug, please report it directly to purplehue@gmail.com."
  },

  // ------------------- SUBSCRIPTION & PAYMENTS -------------------
  {
    question: "Subscription details",
    answer: "We offer free and premium plans. Premium includes advanced AI features, insights, and priority support."
  },
  {
    question: "Subscription or payment issues",
    answer: "For any billing or subscription-related issues, please contact purplehue@gmail.com."
  },
  {
    question: "Do you offer refunds?",
    answer: "No, we currently do not provide refunds."
  },
  {
    question: "Is there a student or team discount?",
    answer: "No, we do not offer student or team discounts at the moment."
  },
  {
    question: "How do I cancel my subscription?",
    answer: "Go to Settings → Subscription → Cancel. Your premium features remain active until the end of the billing cycle."
  },

  // ------------------- COACHING RULE -------------------
  {
    question: "Can a user opt for more than one coach?",
    answer: "No, users can only select one coach at a time."
  },

  // ------------------- ACCOUNT & LOGIN -------------------
  {
    question: "Where do I start as a new user?",
    answer: "Create an account, set your goals, and the AI planner will guide you through the setup process."
  },
  {
    question: "How do I create an account?",
    answer: "Click Sign Up → enter your information → verify your email or phone number."
  },
  {
    question: "Can I have multiple accounts?",
    answer: "Yes, but each account must use a unique email or phone number."
  },
  {
    question: "How do I reset my password?",
    answer: "Use the ‘Forgot Password’ option on the login page to receive a reset link."
  },
  {
    question: "How do I update my profile details?",
    answer: "Go to Profile → Edit Profile → Update your info → Save changes."
  },
  {
    question: "How do I change my username?",
    answer: "Visit Profile → Account Settings → Username → Save the new username."
  },
  {
    question: "How do I change my email or phone number?",
    answer: "Go to Account Settings and update your details. You will need to verify the new email or phone."
  },
  {
    question: "How do I verify my email?",
    answer: "Check your inbox for the verification link sent after sign-up. If needed, click ‘Resend Verification Email’ from settings."
  },
  {
    question: "How do I disable my account temporarily?",
    answer: "Go to Settings → Account → Disable Account. You can reactivate it by logging in."
  },
  {
    question: "How do I delete my account?",
    answer: "Go to Settings → Account → Delete Account. This removes all data permanently."
  },
  {
    question: "How do I delete my data?",
    answer: "Go to Settings → Data & Privacy → Delete My Data. This action is permanent."
  },
  {
    question: "Can I restore something I deleted by mistake?",
    answer: "No, deleted items cannot be restored."
  },
  {
    question: "What happens to my data if I delete my account?",
    answer: "All your data is permanently removed and cannot be recovered."
  },
  {
    question: "How do I log out from all devices?",
    answer: "Go to Security Settings → Log Out From All Devices."
  },

  // ------------------- AI FEATURES -------------------
  {
    question: "How accurate is the AI’s planning?",
    answer: "The AI provides highly accurate recommendations when your preferences and tasks are kept updated."
  },
  {
    question: "Does the AI remember my preferences?",
    answer: "Yes, the AI learns your style, patterns, and needs to improve future suggestions."
  },
  {
    question: "Can the AI create personalized routines?",
    answer: "Yes, the AI can generate routines based on your goals, habits, and availability."
  },
  {
    question: "Can the AI remind me of deadlines?",
    answer: "Yes, the AI can send reminders for deadlines, tasks, and schedules."
  },
  {
    question: "How do I get the AI to create a routine?",
    answer: "Simply ask: “Create a morning routine” or “Plan my week” and the AI will generate one."
  },
  {
    question: "What can the AI help me with?",
    answer: "The AI helps with planning, tasks, reminders, routines, productivity suggestions, and goal tracking."
  },

  // ------------------- TASK MANAGEMENT -------------------
  {
    question: "Can I undo deleting a task?",
    answer: "You can recover tasks from the ‘Recently Deleted’ section for 7 days."
  },
  {
    question: "Can I import tasks from another app?",
    answer: "Yes, go to Settings → Import Tasks and upload supported files (CSV or others)."
  },

  // ------------------- GENERAL PLATFORM QUESTIONS -------------------
  {
    question: "Is it also an app?",
    answer: "No, it is currently only available as a website."
  },
  {
    question: "Is the planner free to use?",
    answer: "Yes, the basic version is free. Premium features are optional."
  },
  {
    question: "What’s included in the free plan?",
    answer: "Basic planner tools, simple AI suggestions, and essential task management."
  },
  {
    question: "How do I download my data?",
    answer: "Visit Settings → Data & Privacy → Download My Data."
  },
  {
    question: "Do you share my information with anyone?",
    answer: "No, your data is not shared or sold to third parties."
  },

  // ------------------- UI & CUSTOMIZATION -------------------
  {
    question: "How do I customize my dashboard layout?",
    answer: "Go to Dashboard → Customize Layout → Rearrange or toggle widgets."
  },
  {
    question: "Can I change the theme colors?",
    answer: "Yes, go to Settings → Appearance → Choose Theme or Custom Colors."
  },
  {
    question: "How do I hide ads?",
    answer: "Ads are removed automatically for Premium users."
  },
  {
    question: "How do I change my language?",
    answer: "Language cannot be changed at the moment; the platform supports only one language."
  },

  // ------------------- ARTICLES -------------------
  {
    question: "How do I bookmark articles?",
    answer: "Open the article and click the Bookmark icon."
  },
  {
    question: "How do I share an article?",
    answer: "Open the article and click the Share/Copy Link button."
  },

  // ------------------- TECHNICAL ISSUES -------------------
  {
    question: "Why is the website showing old data even after refresh?",
    answer: "Your browser may be loading cached data. Try clearing cache or using a hard refresh (Ctrl + Shift + R)."
  },
  {
    question: "Why are icons not appearing?",
    answer: "Icons may fail to load due to slow internet, blocked resources, or missing fonts. Refresh or check your connection."
  },
  {
    question: "Why is the layout broken on Safari?",
    answer: "Safari has limited support for certain modern CSS features. We recommend using Chrome or Edge for the best experience."
  },
  {
    question: "What types of files can I upload?",
    answer: "You can upload common formats like images, PDFs, and documents. Exact supported formats may vary by feature."
  },
  {
    question: "Why does the website not work in Incognito mode?",
    answer: "Some features require local storage or cookies, which are restricted in Incognito mode."
  },
  {
    question: "Why does it work on Wi-Fi but not mobile data?",
    answer: "Your mobile network may be blocking certain requests or slowing them down. Try switching networks."
  },
  {
    question: "Why is my data not syncing?",
    answer: "Check your internet connection. If the issue persists, try logging out and back in."
  },
  {
    question: "The website is not loading",
    answer: "Try refreshing the page, clearing browser cache, or checking your internet connection."
  },
  {
    question: "Why is the website slow?",
    answer: "Too many tabs, slow internet, or a busy device can cause slow loading. Restarting the browser may help."
  },
  {
    question: "Why did I get logged out automatically?",
    answer: "Sessions expire after inactivity for security reasons."
  },
  {
    question: "Does it work on mobile?",
    answer: "Yes, the website is optimized for mobile devices."
  },

  // ------------------- NOTIFICATIONS -------------------
  {
    question: "Why are notifications not working?",
    answer: "Make sure notifications are enabled in both your device settings and browser settings."
  },
  {
    question: "Why do notifications come late?",
    answer: "This can happen due to low-power mode, background restrictions, or weak internet."
  },

  // ------------------- COACHING SERVICES -------------------
  {
    question: "What services does the coach provide?",
    answer: "Services differ for each coach, but generally include planning, productivity support, goal tracking, and habit building."
  },
  {
    question: "Does the coach offer 1:1 coaching?",
    answer: "Yes, 1:1 coaching is available."
  },
  {
    question: "Does the coach offer group coaching?",
    answer: "No, group coaching is not provided."
  },
  {
    question: "Is the coaching personalized?",
    answer: "Yes, all coaching is fully personalized based on your goals and needs."
  },
  {
    question: "Does the coach create custom plans for each client?",
    answer: "Yes, every client receives a customized plan."
  },
  {
    question: "Does the coach help with productivity and habits?",
    answer: "Yes, productivity improvement and habit-building support are included."
  },
  {
    question: "How will progress be tracked?",
    answer: "Progress is tracked through the website’s built-in progress UI."
  },
  {
    question: "How do I check the coach’s availability?",
    answer: "You can view availability on the coach’s profile page."
  },
  {
    question: "What if I miss a session?",
    answer: "You can reschedule based on the coach’s availability."
  },
  {
    question: "Do sessions happen online or in person?",
    answer: "All coaching sessions happen online."
  },
  {
    question: "How can I contact my coach?",
    answer: "You can message or call your coach through the platform."
  },
  {
    question: "Is there a limit to how many messages I can send?",
    answer: "No, you can send unlimited messages."
  },
  {
    question: "Do you guarantee success?",
    answer: "No, success depends on your consistency and effort, but the coach will support you fully."
  },
  {
    question: "Does the coach work with beginners?",
    answer: "Yes, beginners are fully supported."
  },
  {
    question: "Can I switch to a different coach later?",
    answer: "Yes, you may switch to another coach at any time."
  },
  {
    question: "Can I talk to the coach before joining?",
    answer: "No, pre-joining chats are not available."
  },
  {
    question: "Will the coach track my goals through the website?",
    answer: "Yes, all progress and goals are tracked through the platform."
  },
  {
    question: "How do I access coaching materials on the website?",
    answer: "All materials are available under the Coaching → Materials section."
  },
  {
    question: "Does the coach sign an NDA if needed?",
    answer: "Yes, an NDA can be signed upon request."
  },
  {
    question: "Is the coach available for urgent questions?",
    answer: "Yes, urgent questions can be addressed through priority messaging."
  }
];

window.knowledgeBase = knowledgeBase;
