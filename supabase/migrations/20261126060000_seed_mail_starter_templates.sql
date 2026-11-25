-- Brandon RV V2 starter email templates and disabled event mappings.
-- Run only against the dedicated Brandon RV V2 database after reviewing.
-- All templates and triggers start inactive. No email can be sent by this seed alone.
do $$
declare
  v_shell text := $shell$
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f2f3f5;
      font-family: Arial, Helvetica, sans-serif;
      color: #333333;
    }

    table {
      border-collapse: collapse;
      border-spacing: 0;
    }

    .email-wrapper {
      width: 100%;
      padding: 30px 12px;
      background-color: #f2f3f5;
    }

    .email-container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 6px;
      overflow: hidden;
    }

    /* HEADER */

    .header {
      padding: 30px 25px;
      text-align: center;
      background-color: #ffffff;
    }

    .logo {
      display: block;
      width: 100%;
      max-width: 230px;
      height: auto;
      margin: 0 auto;
      border: 0;
    }

    .header-divider {
      height: 4px;
      background-color: #263746;
      line-height: 4px;
      font-size: 0;
    }

    /* EMAIL BODY */

    .content {
      padding: 35px 30px;
      background-color: #ffffff;
      font-size: 15px;
      line-height: 1.7;
      color: #333333;
    }

    /* FOOTER */

    .footer {
      padding: 30px 25px 20px;
      background-color: #263746;
      color: #ffffff;
    }

    .footer-columns {
      width: 100%;
    }

    .footer-column {
      width: 33.33%;
      padding: 0 10px;
      vertical-align: top;
    }

    .footer-heading {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: bold;
      color: #ffffff;
    }

    .footer-text {
      margin: 0 0 8px;
      font-size: 12px;
      line-height: 1.6;
      color: #d9e0e5;
    }

    .footer a {
      color: #d9e0e5;
      text-decoration: none;
    }

    .footer a:hover {
      color: #ffffff;
      text-decoration: underline;
    }

    .footer-bottom {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid #52616d;
      text-align: center;
    }

    .footer-bottom p {
      margin: 0 0 6px;
      font-size: 11px;
      line-height: 1.6;
      color: #c5cdd3;
    }

    /* MOBILE RESPONSIVE */

    @media screen and (max-width: 480px) {
      .email-wrapper {
        padding: 15px 8px;
      }

      .header {
        padding: 25px 15px;
      }

      .content {
        padding: 25px 20px;
      }

      .footer {
        padding: 25px 20px 18px;
      }

      .footer-column {
        display: block;
        width: 100%;
        padding: 0 0 20px;
      }

      .footer-column:last-child {
        padding-bottom: 0;
      }
    }
  </style>
</head>

<body>

  <table role="presentation" width="100%" class="email-wrapper">
    <tr>
      <td align="center">

        <table
          role="presentation"
          width="100%"
          class="email-container"
        >

          <!-- BRAND HEADER -->

          <tr>
            <td class="header">
              <img
                src="https://brandon-rv-v2.vercel.app/imgs/brandonrvlogo.jpg"
                alt="Brandon RV"
                class="logo"
              >
            </td>
          </tr>

          <tr>
            <td class="header-divider"></td>
          </tr>

          <!-- INDIVIDUAL EMAIL CONTENT -->

          <tr>
            <td class="content">
              {{EMAIL_CONTENT}}
            </td>
          </tr>

          <!-- GLOBAL FOOTER -->

          <tr>
            <td class="footer">

              <table
                role="presentation"
                width="100%"
                class="footer-columns"
              >
                <tr>

                  <!-- INFORMATION -->

                  <td class="footer-column">
                    <h3 class="footer-heading">Information</h3>

                    <p class="footer-text">
                      Brandon RV
                    </p>

                    <p class="footer-text">
                      Tamworth, NSW
                    </p>
                  </td>

                  <!-- ABOUT -->

                  <td class="footer-column">
                    <h3 class="footer-heading">About Us</h3>

                    <p class="footer-text">
                      From Factory Experience to Repairs On The Go
                    </p>
                  </td>

                  <!-- CONTACT -->

                  <td class="footer-column">
                    <h3 class="footer-heading">Contact</h3>

                    <p class="footer-text">
                      <a href="tel:0437985190">
                        0437 985 190
                      </a>
                    </p>

                    <p class="footer-text">
                      <a href="mailto:brandon@brandonrv.trade">
                        brandon@brandonrv.trade
                      </a>
                    </p>
                  </td>

                </tr>
              </table>

              <!-- COPYRIGHT -->

              <div class="footer-bottom">
                <p>
                  Brandon RV | Tamworth, NSW
                </p>

                <p>
                  &copy; Brandon RV. All rights reserved.
                </p>
              </div>

            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
$shell$;
  v_items jsonb := $items$[{"key":"account-password-reset","name":"Password Reset","subject":"Reset your Brandon RV password","text":"Hi {{recipient.firstName}},\n\nWe received a request to reset the password for your Brandon RV account. Use the link below to choose a new password:\n{{resetUrl}}\n\nThis link expires at {{expiresAt}}. If you did not request this, you can ignore this email.","html":"<h2>Password reset requested</h2><p>Hi {{recipient.firstName}},</p><p>We received a request to reset the password for your Brandon RV account. Use the button below to choose a new password.</p><p><a href=\"{{resetUrl}}\" style=\"display:inline-block;padding:12px 20px;background:#263746;color:#fff;text-decoration:none;border-radius:4px\">Reset password</a></p><p>This link expires at {{expiresAt}}. If you did not request this, you can ignore this email.</p>","vars":["expiresAt","recipient.firstName","resetUrl"]},{"key":"account-password-changed","name":"Password Changed","subject":"Your Brandon RV password has been changed","text":"Hi {{recipient.firstName}},\n\nYour Brandon RV account password was changed on {{changedAt}}. If you did not make this change, contact Brandon RV immediately.","html":"<h2>Your password has been changed</h2><p>Hi {{recipient.firstName}},</p><p>Your Brandon RV account password was changed on {{changedAt}}.</p><p>If you did not make this change, contact Brandon RV immediately.</p>","vars":["changedAt","recipient.firstName"]},{"key":"customer-welcome","name":"Welcome","subject":"Welcome to Brandon RV","text":"Hi {{recipient.firstName}},\n\nYour Brandon RV customer account has been created. You can sign in to view your details, vehicles, enquiries, quotes and bookings.\n\nWe look forward to helping with your caravan or motorhome.","html":"<h2>Welcome to Brandon RV</h2><p>Hi {{recipient.firstName}},</p><p>Your Brandon RV customer account has been created.</p><p>You can sign in to view your details, vehicles, enquiries, quotes and bookings.</p><p>We look forward to helping with your caravan or motorhome.</p>","vars":["recipient.firstName"]},{"key":"enquiry-received","name":"Enquiry Received","subject":"We have received your enquiry — {{enquiry.referenceNumber}}","text":"Hi {{recipient.firstName}},\n\nThanks for contacting Brandon RV. We have received your enquiry {{enquiry.referenceNumber}}.\n\nRequest: {{enquiry.requestedService}}\nDetails: {{enquiry.description}}\n\nThis email confirms receipt only. It is not a quote or booking. We will review your enquiry and contact you about the next step.","html":"<h2>We've received your enquiry</h2><p>Hi {{recipient.firstName}},</p><p>Thanks for contacting Brandon RV. We have received your enquiry <strong>{{enquiry.referenceNumber}}</strong>.</p><p><strong>Request:</strong> {{enquiry.requestedService}}</p><p><strong>Details:</strong> {{enquiry.description}}</p><p>This email confirms receipt only. It is not a quote or booking. We will review your enquiry and contact you about the next step.</p>","vars":["enquiry.description","enquiry.referenceNumber","enquiry.requestedService","recipient.firstName"]},{"key":"quote-issued","name":"Quote Issued","subject":"Your Brandon RV quote is ready","text":"Hi {{recipient.firstName}},\n\nYour Brandon RV quote {{quote.number}} is ready for review.\n\nQuote total: {{quote.total}}\n\nReview your quote in your customer portal: {{portalUrl}} A quote is not a confirmed booking.","html":"<h2>Your quote is ready</h2><p>Hi {{recipient.firstName}},</p><p>Your Brandon RV quote <strong>{{quote.number}}</strong> is ready for review.</p><p><strong>Quote total:</strong> {{quote.total}}</p><p><a href=\"{{portalUrl}}\">Review your quote in the customer portal</a>. You can accept, decline or request changes there.</p><p>A quote is not a confirmed booking.</p>","vars":["portalUrl","quote.number","quote.total","recipient.firstName"]},{"key":"quote-accepted","name":"Quote Accepted","subject":"Your quote response has been received","text":"Hi {{recipient.firstName}},\n\nWe have recorded your response to Brandon RV quote {{quote.number}}: {{response.decision}}.\n\nOur team will review the next steps. Accepting a quote does not itself confirm an appointment; we will contact you about booking arrangements.","html":"<h2>Quote response received</h2><p>Hi {{recipient.firstName}},</p><p>We have recorded your response to Brandon RV quote <strong>{{quote.number}}</strong>: <strong>{{response.decision}}</strong>.</p><p>Our team will review the next steps. Accepting a quote does not itself confirm an appointment; we will contact you about booking arrangements.</p>","vars":["quote.number","recipient.firstName","response.decision"]},{"key":"quote-declined","name":"Quote Declined","subject":"Your quote response has been recorded","text":"Hi {{recipient.firstName}},\n\nWe have recorded your response to Brandon RV quote {{quote.number}}: declined.\n\nIf you would like to discuss the quote or a different scope of work, please contact us.","html":"<h2>Quote response recorded</h2><p>Hi {{recipient.firstName}},</p><p>We have recorded your response to Brandon RV quote <strong>{{quote.number}}</strong>: declined.</p><p>If you would like to discuss the quote or a different scope of work, please contact us.</p>","vars":["quote.number","recipient.firstName"]},{"key":"booking-confirmed","name":"Booking Confirmed","subject":"Your Brandon RV booking is confirmed","text":"Hi {{recipient.firstName}},\n\nYour Brandon RV booking is confirmed.\n\nDate and time: {{booking.startsAt}}\nLocation: {{booking.location}}\n\nIf you need to change these arrangements, contact us as soon as possible.","html":"<h2>Your booking is confirmed</h2><p>Hi {{recipient.firstName}},</p><p>Your Brandon RV booking is confirmed.</p><p><strong>Date and time:</strong> {{booking.startsAt}}</p><p><strong>Location:</strong> {{booking.location}}</p><p>If you need to change these arrangements, contact us as soon as possible.</p>","vars":["booking.location","booking.startsAt","recipient.firstName"]},{"key":"booking-rescheduled","name":"Booking Rescheduled","subject":"Your Brandon RV booking has been updated","text":"Hi {{recipient.firstName}},\n\nYour Brandon RV booking has been rescheduled.\n\nUpdated date and time: {{booking.startsAt}}\nLocation: {{booking.location}}\n\nPlease contact us if these details are not correct.","html":"<h2>Your booking has been rescheduled</h2><p>Hi {{recipient.firstName}},</p><p>Your Brandon RV booking has been rescheduled.</p><p><strong>Updated date and time:</strong> {{booking.startsAt}}</p><p><strong>Location:</strong> {{booking.location}}</p><p>Please contact us if these details are not correct.</p>","vars":["booking.location","booking.startsAt","recipient.firstName"]},{"key":"booking-cancelled","name":"Booking Cancelled","subject":"Your Brandon RV booking has been cancelled","text":"Hi {{recipient.firstName}},\n\nYour Brandon RV booking has been cancelled.\n\nIf you believe this is incorrect or would like to arrange another time, please contact us.","html":"<h2>Your booking has been cancelled</h2><p>Hi {{recipient.firstName}},</p><p>Your Brandon RV booking has been cancelled.</p><p>If you believe this is incorrect or would like to arrange another time, please contact us.</p>","vars":["recipient.firstName"]},{"key":"invoice-issued","name":"Invoice Issued","subject":"Your Brandon RV invoice is ready","text":"Hi {{recipient.firstName}},\n\nYour Brandon RV invoice {{invoice.number}} has been issued.\n\nAmount due: {{invoice.total}}\nDue date: {{invoice.dueDate}}\n\nPlease use the payment instructions shown on your invoice. Contact us if you have any questions.","html":"<h2>Your invoice is ready</h2><p>Hi {{recipient.firstName}},</p><p>Your Brandon RV invoice <strong>{{invoice.number}}</strong> has been issued.</p><p><strong>Amount due:</strong> {{invoice.total}}<br><strong>Due date:</strong> {{invoice.dueDate}}</p><p>Please use the payment instructions shown on your invoice. Contact us if you have any questions.</p>","vars":["invoice.dueDate","invoice.number","invoice.total","recipient.firstName"]},{"key":"payment-received","name":"Payment Received","subject":"We have received your payment","text":"Hi {{recipient.firstName}},\n\nThank you. Brandon RV has received your payment.\n\nInvoice: {{invoice.number}}\nAmount received: {{payment.amount}}\nDate received: {{receivedAt}}\n\nKeep this email for your records.","html":"<h2>Payment received</h2><p>Hi {{recipient.firstName}},</p><p>Thank you. Brandon RV has received your payment.</p><p><strong>Invoice:</strong> {{invoice.number}}<br><strong>Amount received:</strong> {{payment.amount}}<br><strong>Date received:</strong> {{receivedAt}}</p><p>Keep this email for your records.</p>","vars":["invoice.number","payment.amount","receivedAt","recipient.firstName"]},{"key":"payment-refunded","name":"Payment Refunded","subject":"Your Brandon RV refund has been recorded","text":"Hi {{recipient.firstName}},\n\nA refund has been recorded by Brandon RV.\n\nAmount refunded: {{refund.amount}}\nInvoice: {{invoice.number}}\n\nPlease allow your payment provider time to process the refund.","html":"<h2>Refund recorded</h2><p>Hi {{recipient.firstName}},</p><p>A refund has been recorded by Brandon RV.</p><p><strong>Amount refunded:</strong> {{refund.amount}}<br><strong>Invoice:</strong> {{invoice.number}}</p><p>Please allow your payment provider time to process the refund.</p>","vars":["invoice.number","recipient.firstName","refund.amount"]}]$items$::jsonb;
  item jsonb;
begin
  for item in select value from jsonb_array_elements(v_items)
  loop
    insert into app_mail_templates (
      template_key, display_name, subject, body_text, body_html, variables, active
    ) values (
      item->>'key',
      item->>'name',
      item->>'subject',
      item->>'text',
      replace(v_shell, '{{EMAIL_CONTENT}}', item->>'html'),
      item->'vars',
      false
    )
    on conflict (template_key) do nothing;

    insert into app_mail_triggers (
      event_key, template_key, route_key, recipient_mapping, active
    ) values (
      case item->>'key'
        when 'account-password-reset' then 'account.password_reset_requested'
        when 'account-password-changed' then 'account.password_changed'
        when 'customer-welcome' then 'customer.account_created'
        when 'enquiry-received' then 'enquiry.received'
        when 'quote-issued' then 'quote.issued'
        when 'quote-accepted' then 'quote.accepted'
        when 'quote-declined' then 'quote.declined'
        when 'booking-confirmed' then 'booking.confirmed'
        when 'booking-rescheduled' then 'booking.rescheduled'
        when 'booking-cancelled' then 'booking.cancelled'
        when 'invoice-issued' then 'invoice.issued'
        when 'payment-received' then 'payment.received'
        when 'payment-refunded' then 'payment.refunded'
      end,
      item->>'key',
      null,
      '{"to":"recipient.email"}'::jsonb,
      false
    )
    on conflict (event_key) do nothing;
  end loop;
end $$;
