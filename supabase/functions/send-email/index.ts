import { corsHeaders } from "@shared/cors.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
      status: 200,
    });
  }

  try {
    const { to, subject, html, text, type = "notification" } = await req.json();

    console.log("📧 Send Email Function Called:", {
      to: Array.isArray(to) ? to : [to],
      subject,
      type,
      hasHtml: !!html,
      hasText: !!text,
    });

    // Validate required fields
    if (!to || !subject || (!html && !text)) {
      console.error("❌ Validation failed - missing required fields");
      return new Response(
        JSON.stringify({
          error: "Missing required fields: to, subject, and html or text",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // Get Resend API key from environment
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      console.warn(
        "⚠️ RESEND_API_KEY not found - logging email instead of sending",
      );

      // Log the email instead of sending it
      const emailData = {
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        type,
        timestamp: new Date().toISOString(),
        status: "logged",
      };

      console.log("📧 EMAIL LOGGED (no API key):", emailData);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Email logged successfully (RESEND_API_KEY not configured)",
          data: emailData,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Send email using Resend API
    console.log("📤 Attempting to send email via Resend...");

    const emailPayload = {
      from: "Hyperliquid Tracker <onboarding@resend.dev>",
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("❌ Resend API error:", {
        status: response.status,
        statusText: response.statusText,
        data: responseData,
      });

      return new Response(
        JSON.stringify({
          error: "Failed to send email",
          details: responseData,
          status: response.status,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    console.log("✅ Email sent successfully via Resend:", responseData);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
        data: {
          id: responseData.id,
          to: emailPayload.to,
          subject: emailPayload.subject,
          timestamp: new Date().toISOString(),
          status: "sent",
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("💥 Error in send-email function:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
