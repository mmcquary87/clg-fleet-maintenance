import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Stateless by design (matches the edge function): conversation lives only
// in this component's state and is resent in full on every question. No
// chat-history table for v1 -- refreshing the page starts a new session.
export function useCopilot() {
  const [messages, setMessages] = useState([]); // [{ role: "user" | "assistant", content: string }]
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const ask = async (question) => {
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setSending(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("ops-copilot", {
        body: { messages: nextMessages },
      });
      if (fnError) {
        let message = fnError.message;
        try {
          const body = await fnError.context?.json();
          if (body?.error) message = body.error;
        } catch { /* context wasn't JSON -- keep the generic message */ }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      setMessages([...nextMessages, { role: "assistant", content: data.answer }]);
    } catch (err) {
      setError(err.message);
      // Drop the just-added user question so the input can be retried
      // rather than leaving an unanswered bubble in the transcript.
      setMessages(messages);
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setError(null);
  };

  return { messages, sending, error, ask, reset };
}
