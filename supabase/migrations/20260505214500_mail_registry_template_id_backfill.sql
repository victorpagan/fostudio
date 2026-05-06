-- Ensure every registered mail event has a registry row and a usable fallback SendGrid template.
-- Existing non-empty template IDs are preserved; missing/blank IDs get the shared FO Studio template.
WITH registered AS (
  SELECT *
  FROM jsonb_to_recordset($mail$[
  {
    "event_type": "account.guestOnboardingReminder",
    "category": "non_critical",
    "description": "New guest account onboarding reminder.",
    "subject_template": "Ready to book FO Studio?",
    "preheader_template": "Your guest account is ready. Add credits or compare memberships.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Ready when you are</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your FO Studio guest account is ready.</p>\n<p style=\"margin:0 0 14px;\">You can book studio time as a guest using premium credits. If you plan to book often, memberships include lower effective credit costs, member booking windows, and access benefits.</p>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ creditsUrl }}\">Buy guest credits</a></p>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ bookUrl }}\">View booking calendar</a></p>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ membershipUrl }}\">Compare memberships</a></p>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ dashboardUrl }}\">Open your dashboard</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "account.inactiveReminder",
    "category": "non_critical",
    "description": "Inactive account reminder.",
    "subject_template": "Ready to book FO Studio?",
    "preheader_template": "Your account is still available. Book as a guest or compare memberships.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Still interested?</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your FO Studio account is still available when you are ready.</p>\n<p style=\"margin:0 0 14px;\">You can book as a guest with premium credits or choose a membership for lower credit costs and member benefits.</p>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ bookUrl }}\">View booking calendar</a></p>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ membershipUrl }}\">Compare memberships</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "account.signup",
    "category": "critical",
    "description": "New account created through public signup.",
    "subject_template": "Welcome to FO Studio",
    "preheader_template": "Your FO Studio account is ready. Finish onboarding to start booking.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Welcome to FO Studio</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your account is ready.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0;\"><strong>Email:</strong> {{ customerEmail }}</p>\n</div>\n<p style=\"margin:0 0 14px;\">Next, complete onboarding so you can book studio time.</p>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ onboardingUrl }}\">Continue onboarding</a></p>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ dashboardUrl }}\">Open your dashboard</a></p>\n<p style=\"margin:0 0 16px;\">Need to sign in again? <a href=\"{{ loginUrl }}\">Log in here</a>.</p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "booking.guestConfirmed",
    "category": "critical",
    "description": "Guest booking confirmation with access details.",
    "subject_template": "Guest booking confirmed: {{ bookingStart }}",
    "preheader_template": "Your booking is confirmed with access details included.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Guest booking confirmed</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ guestName }}, your FO Studio booking is confirmed. Your guest access details are below.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Booking ID:</strong> {{ bookingId }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Start:</strong> {{ bookingStart }}</p>\n<p style=\"margin:0 0 8px;\"><strong>End:</strong> {{ bookingEnd }}</p>\n<p style=\"margin:0;\"><strong>Guest access code:</strong> <span style=\"font-size:18px;letter-spacing:1px;\">{{ accessCode }}</span></p>\n</div>\n<p style=\"margin:0 0 14px;\">Keep your guest access code private. It is intended only for your confirmed booking window.</p>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ calendarUrl }}\">Add to calendar</a></p>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ manageUrl }}\">View booking details</a></p>\n<p style=\"margin:0 0 16px;\"><strong>Studio address:</strong> {{ studioAddress }}</p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "booking.memberCanceled",
    "category": "critical",
    "description": "Member booking canceled with refund details when applicable.",
    "subject_template": "Booking canceled: {{ bookingStartHuman }}",
    "preheader_template": "Your FO Studio booking has been canceled.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Booking canceled</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, this booking was canceled by {{ actionedBy }}.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Booking ID:</strong> {{ bookingId }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Original time:</strong> {{ bookingStartHuman }} → {{ bookingEndHuman }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Credits originally used:</strong> {{ creditsBurned }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Credits refunded:</strong> {{ creditsRefunded }}</p>\n<p style=\"margin:0;\"><strong>Equipment hold:</strong> {{ holdStatus }}</p>\n</div>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ manageUrl }}\">View bookings</a></p>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ calendarUrl }}\">View calendar</a></p>\n<p style=\"margin:0 0 16px;\"><strong>Studio address:</strong> {{ studioAddress }}</p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "booking.memberCreated",
    "category": "critical",
    "description": "Member booking confirmation after a session is created.",
    "subject_template": "Booking confirmed: {{ bookingStartHuman }}",
    "preheader_template": "Your FO Studio session is confirmed.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Booking confirmed</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your booking is confirmed.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Booking ID:</strong> {{ bookingId }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Start:</strong> {{ bookingStartHuman }}</p>\n<p style=\"margin:0 0 8px;\"><strong>End:</strong> {{ bookingEndHuman }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Credits used:</strong> {{ creditsBurned }}</p>\n<p style=\"margin:0;\"><strong>Equipment hold:</strong> {{ holdStatus }}</p>\n</div>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ manageUrl }}\">Manage booking</a></p>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ calendarUrl }}\">View calendar</a></p>\n<p style=\"margin:0 0 16px;\"><strong>Studio address:</strong> {{ studioAddress }}</p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "booking.memberRescheduled",
    "category": "critical",
    "description": "Member booking schedule updated (reschedule/extension).",
    "subject_template": "Booking updated: {{ bookingStartHuman }}",
    "preheader_template": "Your FO Studio booking schedule has been updated.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Booking updated</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your booking was updated by {{ actionedBy }}.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Booking ID:</strong> {{ bookingId }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Previous:</strong> {{ previousBookingStartHuman }} → {{ previousBookingEndHuman }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Updated:</strong> {{ bookingStartHuman }} → {{ bookingEndHuman }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Credits after update:</strong> {{ creditsBurned }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Credit change:</strong> {{ creditsDelta }}</p>\n<p style=\"margin:0;\"><strong>Equipment hold:</strong> {{ holdStatus }}</p>\n</div>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ manageUrl }}\">Manage booking</a></p>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ calendarUrl }}\">View calendar</a></p>\n<p style=\"margin:0 0 16px;\"><strong>Studio address:</strong> {{ studioAddress }}</p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "booking.reactivationReminder",
    "category": "non_critical",
    "description": "Reactivation reminder after a user has not booked recently.",
    "subject_template": "It has been a while since your last FO Studio booking",
    "preheader_template": "Check the calendar and book your next session.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Book your next session</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, it has been {{ daysSinceLastBooking }} days since your last FO Studio booking.</p>\n<p style=\"margin:0 0 14px;\">Your last session was {{ lastBookingStartHuman }}. Check the calendar when you are ready for your next shoot.</p>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ bookUrl }}\">Book studio time</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "booking.upcomingReminder",
    "category": "non_critical",
    "description": "Reminder before an upcoming booking.",
    "subject_template": "Reminder: your FO Studio booking is {{ reminderLabel }}",
    "preheader_template": "Your session starts {{ bookingStartHuman }}.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Booking reminder</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, this is a reminder that your FO Studio booking is {{ reminderLabel }}.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Booking ID:</strong> {{ bookingId }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Start:</strong> {{ bookingStartHuman }}</p>\n<p style=\"margin:0 0 8px;\"><strong>End:</strong> {{ bookingEndHuman }}</p>\n<p style=\"margin:0;\"><strong>Address:</strong> {{ studioAddress }}</p>\n</div>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ manageUrl }}\">View booking</a></p>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ calendarUrl }}\">Open studio calendar</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "contact.formSubmitted",
    "category": "critical",
    "description": "Contact form submission delivered to studio admins.",
    "subject_template": "Contact form: {{ contactSubject }}",
    "preheader_template": "New contact request from {{ contactName }}.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">New contact request</h1>\n<p style=\"margin:0 0 14px;\">A new website contact form submission was received.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Submitted:</strong> {{ submittedAt }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Source:</strong> {{ source }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Name:</strong> {{ contactName }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Email:</strong> {{ contactEmail }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Phone:</strong> {{ contactPhone }}</p>\n<p style=\"margin:0;\"><strong>Subject:</strong> {{ contactSubject }}</p>\n</div>\n<p style=\"margin:0 0 8px;\"><strong>Message:</strong></p>\n<div style=\"white-space:pre-wrap;background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin:0 0 16px;\">\n{{ contactMessage }}\n</div>\n<p style=\"margin:0;\"><a href=\"mailto:{{ replyTo }}\">Reply to {{ contactName }}</a></p>\n</div>"
  },
  {
    "event_type": "credits.expiringReminder",
    "category": "non_critical",
    "description": "Reminder before active credits expire.",
    "subject_template": "{{ creditsExpiring }} FO Studio credits expire {{ creditsExpireAtHuman }}",
    "preheader_template": "Use your credits before they expire.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Credits expiring soon</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, you have {{ creditsExpiring }} credits expiring {{ creditsExpireAtHuman }}.</p>\n<p style=\"margin:0 0 14px;\">That is {{ daysUntilExpiry }} days from now. Book before then to use them.</p>\n<div style=\"background:#fff8f2;border:1px solid #ffd8b0;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Credits expiring:</strong> {{ creditsExpiring }}</p>\n<p style=\"margin:0;\"><strong>Expires:</strong> {{ creditsExpireAtHuman }}</p>\n</div>\n<p style=\"margin:0 0 8px;\"><a href=\"{{ bookUrl }}\">Book studio time</a></p>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ creditsUrl }}\">View credits</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "credits.topupPurchased",
    "category": "critical",
    "description": "Credits top-off purchase completed.",
    "subject_template": "Credit top-up confirmed",
    "preheader_template": "{{ creditsAdded }} credits added. New balance: {{ newBalance }}.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Credit top-up complete</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your account has been updated with additional booking credits.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Top-up:</strong> {{ optionLabel }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Credits added:</strong> {{ creditsAdded }}</p>\n<p style=\"margin:0 0 8px;\"><strong>New balance:</strong> {{ newBalance }}</p>\n<p style=\"margin:0;\"><strong>Amount:</strong> &#36;{{ amountDollars }}</p>\n</div>\n<p style=\"margin:0 0 14px;\">Payment reference: {{ paymentId }}</p>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ bookUrl }}\">Use credits to book studio time</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "holds.topupPurchased",
    "category": "critical",
    "description": "Equipment hold top-off purchase completed.",
    "subject_template": "Equipment hold top-up confirmed",
    "preheader_template": "{{ holdsAdded }} hold credits added. New hold balance: {{ newHoldBalance }}.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Equipment hold top-up complete</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your account now has additional equipment hold credits.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Top-up:</strong> {{ label }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Hold credits added:</strong> {{ holdsAdded }}</p>\n<p style=\"margin:0 0 8px;\"><strong>New hold balance:</strong> {{ newHoldBalance }}</p>\n<p style=\"margin:0;\"><strong>Amount:</strong> &#36;{{ amountDollars }}</p>\n</div>\n<p style=\"margin:0 0 14px;\">Payment reference: {{ paymentId }}</p>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ manageUrl }}\">Manage your bookings and holds</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "mailing.memberBroadcast",
    "category": "non_critical",
    "description": "Manual member broadcast list email sent by admin.",
    "subject_template": "Studio update for {{ customerName }}",
    "preheader_template": "Important FO Studio updates and next steps.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">FO Studio update</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }},</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Membership:</strong> {{ membershipPlanName }}</p>\n<p style=\"margin:0;\"><strong>Current period:</strong> {{ startPeriodHuman }} to {{ endPeriodHuman }}</p>\n</div>\n<h2 style=\"font-size:18px;margin:0 0 10px;\">Quick links</h2>\n<ul style=\"margin:0 0 16px 20px;padding:0;\">\n<li style=\"margin:0 0 8px;\"><a href=\"{{ bookUrl }}\">Book studio time</a></li>\n<li style=\"margin:0 0 8px;\"><a href=\"{{ membershipUrl }}\">Manage membership</a></li>\n<li style=\"margin:0;\"><a href=\"{{ waiverUrl }}\">Review waiver</a></li>\n</ul>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "membership.cancellationEndingReminder",
    "category": "non_critical",
    "description": "Reminder before a scheduled membership cancellation reaches period end.",
    "subject_template": "Your FO Studio membership ends {{ endPeriodHuman }}",
    "preheader_template": "Your scheduled cancellation is coming up.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Membership ending soon</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your {{ membershipPlanName }} membership is scheduled to end {{ endPeriodHuman }}.</p>\n<p style=\"margin:0 0 14px;\">That is {{ daysUntilEnd }} days from now. You can manage your cancellation from your dashboard.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Membership:</strong> {{ membershipPlanName }}</p>\n<p style=\"margin:0;\"><strong>End date:</strong> {{ endPeriodHuman }}</p>\n</div>\n<p style=\"margin:0 0 16px;\">You can manage your membership from <a href=\"{{ membershipUrl }}\">your dashboard</a>.</p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "membership.checkoutActivationPending",
    "category": "critical",
    "description": "Checkout paid, but activation requires follow-up action.",
    "subject_template": "Complete your membership activation",
    "preheader_template": "Payment was received. Finish activation to start booking.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Finish membership activation</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your payment is complete. Activation is the last step before booking access.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Plan:</strong> {{ membershipPlanName }}</p>\n<p style=\"margin:0;\"><strong>Cadence:</strong> {{ cadenceLabel }}</p>\n</div>\n<p style=\"margin:0 0 14px;\"><a href=\"{{ activationUrl }}\">Activate membership now</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "membership.doorCodeUpdated",
    "category": "critical",
    "description": "Member door code was assigned or updated.",
    "subject_template": "Your studio door code was updated",
    "preheader_template": "Save your updated code before your next session.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Door code updated</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your studio door code has been updated.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>New code:</strong> <span style=\"font-size:18px;letter-spacing:1px;\">{{ doorCode }}</span></p>\n<p style=\"margin:0 0 8px;\"><strong>Updated:</strong> {{ doorCodeUpdatedAt }}</p>\n<p style=\"margin:0;\"><strong>Membership:</strong> {{ membershipPlanName }}</p>\n</div>\n<p style=\"margin:0;\">Keep this code private. If this change looks unexpected, contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "membership.ended",
    "category": "critical",
    "description": "Membership canceled or ended.",
    "subject_template": "Your FO Studio membership has ended",
    "preheader_template": "Your membership period has ended. You can view current options from your dashboard.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Membership ended</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your membership is no longer active.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Plan:</strong> {{ membershipPlanName }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Last period:</strong> {{ startPeriodHuman }} to {{ endPeriodHuman }}</p>\n<p style=\"margin:0;\"><strong>Status:</strong> {{ squareStatus }}</p>\n</div>\n<p style=\"margin:0 0 14px;\">You can view available membership options from your dashboard.</p>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ membershipUrl }}\">View membership options</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "membership.pastDue",
    "category": "critical",
    "description": "Membership payment moved to past due.",
    "subject_template": "Action needed: membership payment issue",
    "preheader_template": "Your membership is past due. Update payment to keep access active.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Membership payment issue</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, we could not process your latest membership payment.</p>\n<div style=\"background:#fff8f2;border:1px solid #ffd8b0;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Plan:</strong> {{ membershipPlanName }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Period:</strong> {{ startPeriodHuman }} to {{ endPeriodHuman }}</p>\n<p style=\"margin:0;\"><strong>Status:</strong> {{ squareStatus }}</p>\n</div>\n<p style=\"margin:0 0 14px;\">Please update your billing to keep your membership and studio access active.</p>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ membershipUrl }}\">Manage membership billing</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "membership.pastDueReminder",
    "category": "non_critical",
    "description": "Follow-up reminder for a past-due membership.",
    "subject_template": "Reminder: membership payment still needs attention",
    "preheader_template": "Update billing to keep your FO Studio membership active.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Payment reminder</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your {{ membershipPlanName }} membership is still marked past due.</p>\n<div style=\"background:#fff8f2;border:1px solid #ffd8b0;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Membership:</strong> {{ membershipPlanName }}</p>\n<p style=\"margin:0;\"><strong>Current period ends:</strong> {{ endPeriodHuman }}</p>\n</div>\n<p style=\"margin:0 0 16px;\">Please <a href=\"{{ membershipUrl }}\">manage membership billing</a> to keep access active.</p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "membership.renewed",
    "category": "critical",
    "description": "Membership invoice paid and cycle renewed.",
    "subject_template": "Your membership renewed successfully",
    "preheader_template": "A new billing period has started for your membership.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Membership renewed</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your renewal payment went through and your membership remains active.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Plan:</strong> {{ membershipPlanName }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Cadence:</strong> {{ cadenceLabel }}</p>\n<p style=\"margin:0 0 8px;\"><strong>New period:</strong> {{ startPeriodHuman }} to {{ endPeriodHuman }}</p>\n<p style=\"margin:0;\"><strong>Invoice:</strong> {{ invoiceId }}</p>\n</div>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ bookUrl }}\">Book studio time</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "membership.started",
    "category": "critical",
    "description": "Membership started or returned to active.",
    "subject_template": "Your {{ membershipPlanName }} membership is active",
    "preheader_template": "Your door code, membership period, waiver link, and booking link are inside.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Welcome to FO Studio {{ customerName }}!</h1>\n<p style=\"margin:0 0 16px;\">Your membership is active and you are ready to book. Here are the essentials to get started right away.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 18px;\">\n<p style=\"margin:0 0 8px;\"><strong>Membership:</strong> {{ membershipPlanName }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Period:</strong> {{ startPeriodHuman }} to {{ endPeriodHuman }}</p>\n<p style=\"margin:0;\"><strong>Door Code:</strong> <span style=\"font-size:18px;letter-spacing:1px;\">{{ doorCode }}</span></p>\n</div>\n<h2 style=\"font-size:18px;margin:0 0 10px;\">Next steps</h2>\n<ol style=\"margin:0 0 18px 20px;padding:0;\">\n<li style=\"margin:0 0 8px;\">Sign your waiver before your first session: <a href=\"{{ waiverUrl }}\">Complete waiver</a></li>\n<li style=\"margin:0 0 8px;\">Book your first studio time: <a href=\"{{ bookUrl }}\">Book now</a></li>\n<li style=\"margin:0;\">Save your door code somewhere secure for day-of access.</li>\n</ol>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "membership.waitlistInvite",
    "category": "non_critical",
    "description": "Member invite to complete checkout from the waitlist.",
    "subject_template": "Your membership spot is available",
    "preheader_template": "Complete checkout to claim your spot at FO Studio.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Membership spot available</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, a spot has opened for your requested FO Studio membership.</p>\n<div style=\"background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;\">\n<p style=\"margin:0 0 8px;\"><strong>Plan:</strong> {{ membershipPlanName }}</p>\n<p style=\"margin:0 0 8px;\"><strong>Cadence:</strong> {{ cadenceLabel }}</p>\n<p style=\"margin:0;\"><strong>Priority waitlist:</strong> {{ isPriorityMember }}</p>\n</div>\n<p style=\"margin:0 0 14px;\">Complete checkout to secure your spot:</p>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ checkoutUrl }}\">Complete membership checkout</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  },
  {
    "event_type": "waiver.expiringReminder",
    "category": "non_critical",
    "description": "Reminder before a signed waiver expires.",
    "subject_template": "Your FO Studio waiver expires {{ waiverExpiresAtHuman }}",
    "preheader_template": "Renew your waiver before your next booking.",
    "body_template": "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;\">\n<h1 style=\"font-size:24px;margin:0 0 12px;\">Waiver expiring soon</h1>\n<p style=\"margin:0 0 14px;\">Hi {{ customerName }}, your FO Studio waiver expires {{ waiverExpiresAtHuman }}.</p>\n<p style=\"margin:0 0 14px;\">That is {{ daysUntilExpiry }} days from now. Please renew it before your next session to avoid access delays.</p>\n<p style=\"margin:0 0 16px;\"><a href=\"{{ waiverUrl }}\">Renew waiver</a></p>\n<p style=\"margin:16px 0 0;font-size:13px;color:#666;\">Questions? Reply to this email or contact <a href=\"mailto:{{ supportEmail }}\">{{ supportEmail }}</a>.</p>\n</div>"
  }
]$mail$::jsonb) AS row(
    event_type text,
    category text,
    description text,
    subject_template text,
    preheader_template text,
    body_template text
  )
)
INSERT INTO public.mail_template_registry (
  event_type,
  sendgrid_template_id,
  category,
  active,
  description,
  subject_template,
  preheader_template,
  body_template
)
SELECT
  event_type,
  'd-4ebd522797324b88b14803e24a900341',
  category,
  true,
  description,
  NULLIF(subject_template, ''),
  NULLIF(preheader_template, ''),
  NULLIF(body_template, '')
FROM registered
ON CONFLICT (event_type) DO UPDATE
SET
  sendgrid_template_id = CASE
    WHEN NULLIF(BTRIM(COALESCE(mail_template_registry.sendgrid_template_id, '')), '') IS NULL
      THEN EXCLUDED.sendgrid_template_id
    ELSE mail_template_registry.sendgrid_template_id
  END,
  category = COALESCE(mail_template_registry.category, EXCLUDED.category),
  active = COALESCE(mail_template_registry.active, EXCLUDED.active),
  description = COALESCE(NULLIF(BTRIM(COALESCE(mail_template_registry.description, '')), ''), EXCLUDED.description),
  subject_template = COALESCE(NULLIF(mail_template_registry.subject_template, ''), EXCLUDED.subject_template),
  preheader_template = COALESCE(NULLIF(mail_template_registry.preheader_template, ''), EXCLUDED.preheader_template),
  body_template = COALESCE(NULLIF(mail_template_registry.body_template, ''), EXCLUDED.body_template),
  updated_at = now();
