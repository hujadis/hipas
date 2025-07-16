import { corsHeaders } from "@shared/cors.ts";

Deno.serve(async (req) => {
  console.log(`🚀 Send Email Function Started - ${new Date().toISOString()}`);
  console.log(`📥 Request method: ${req.method}`);
  console.log(`📍 Request URL: ${req.url}`);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("✅ Handling CORS preflight request");
    return new Response("ok", {
      headers: corsHeaders,
      status: 200,
    });
  }

  try {
    console.log("📖 Reading request body...");
    const requestBody = await req.text();
    console.log("📄 Raw request body:", requestBody);

    let parsedBody;
    try {
      parsedBody = JSON.parse(requestBody);
    } catch (parseError) {
      console.error("❌ JSON parsing error:", parseError);
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body",
          details: parseError.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const { to, subject, html, text, type = "notification" } = parsedBody;

    console.log("📧 Send Email Function Called:", {
      to: Array.isArray(to) ? to : [to],
      subject,
      type,
      hasHtml: !!html,
      hasText: !!text,
      htmlLength: html ? html.length : 0,
      textLength: text ? text.length : 0,
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
    console.log("🔑 Checking for RESEND_API_KEY...");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    console.log(`🔐 RESEND_API_KEY ${resendApiKey ? "found" : "NOT FOUND"}`);

    // List all environment variables for debugging (without values)
    console.log(
      "🌍 Available environment variables:",
      Object.keys(Deno.env.toObject()),
    );

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

    console.log("📦 Email payload prepared:", {
      from: emailPayload.from,
      to: emailPayload.to,
      subject: emailPayload.subject,
      hasHtml: !!emailPayload.html,
      hasText: !!emailPayload.text,
    });

    console.log("🌐 Making request to Resend API...");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    console.log(
      `📡 Resend API response status: ${response.status} ${response.statusText}`,
    );

    let responseData;
    try {
      responseData = await response.json();
      console.log("📄 Resend API response data:", responseData);
    } catch (jsonError) {
      console.error(
        "❌ Failed to parse Resend API response as JSON:",
        jsonError,
      );
      const responseText = await response.text();
      console.log("📄 Raw Resend API response:", responseText);
      responseData = {
        error: "Failed to parse response",
        rawResponse: responseText,
      };
    }

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
      error: error,
    });

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
        stack: error.stack,
        name: error.name,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
