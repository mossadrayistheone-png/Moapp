import { useState, useRef, useCallback, useEffect } from 'react';
import { useMoChat, useMoSpeak } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export function useVoiceAssistant() {
  const [state, setState] = useState<AssistantState>('idle');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const stateRef = useRef<AssistantState>('idle');

  const { toast } = useToast();
  const chatMutation = useMoChat();
  const speakMutation = useMoSpeak();

  // Keep stateRef in sync for event handlers
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Initialize SpeechRecognition on mount
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        transcriptRef.current = currentTranscript;
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') return; // Ignore silent timeouts
        console.error("Speech recognition error:", event.error);
        setState('error');
        toast({
          title: "Microphone Error",
          description: "Please ensure microphone permissions are granted.",
          variant: "destructive",
        });
      };

      recognition.onend = () => {
        // If it ended and we were listening, it means the user stopped talking naturally
        if (stateRef.current === 'listening') {
          if (transcriptRef.current.trim()) {
            processTranscript(transcriptRef.current);
          } else {
            setState('idle');
          }
        }
      };

      recognitionRef.current = recognition;
    } else {
      toast({
        title: "Browser Unsupported",
        description: "Your browser does not support the Web Speech API. Try Chrome or Edge.",
        variant: "destructive",
      });
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [toast]);

  const processTranscript = useCallback(async (finalText: string) => {
    if (!finalText.trim()) {
      setState('idle');
      return;
    }

    try {
      setState('thinking');
      
      // 1. Send text to chat API
      const chatRes = await chatMutation.mutateAsync({ data: { message: finalText } });
      setReply(chatRes.reply);

      // 2. Convert reply to audio
      const audioBlob = await speakMutation.mutateAsync({ data: { text: chatRes.reply } });
      const audioUrl = URL.createObjectURL(audioBlob);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      // 3. Play audio
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setState('idle');
      };

      setState('speaking');
      await audio.play();

    } catch (err: any) {
      console.error("Assistant Error:", err);
      setState('error');
      toast({
        title: "Connection Error",
        description: err.message || "Failed to communicate with Mo. Please try again.",
        variant: "destructive",
      });
      setTimeout(() => setState('idle'), 3000);
    }
  }, [chatMutation, speakMutation, toast]);

  const start = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    
    transcriptRef.current = '';
    setTranscript('');
    setReply('');
    setState('listening');
    
    try {
      recognitionRef.current?.start();
    } catch (e) {
      // Handle case where recognition is already started
      recognitionRef.current?.stop();
      setTimeout(() => recognitionRef.current?.start(), 100);
    }
  }, []);

  const stop = useCallback(() => {
    if (state === 'listening') {
      recognitionRef.current?.stop();
      // processTranscript will be called by onend if there's text
    } else {
      recognitionRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setState('idle');
    }
  }, [state]);

  const toggle = useCallback(() => {
    if (state === 'idle' || state === 'error') {
      start();
    } else {
      stop();
    }
  }, [state, start, stop]);

  return { 
    state, 
    transcript, 
    reply, 
    toggle,
    isIdle: state === 'idle',
    isListening: state === 'listening',
    isThinking: state === 'thinking',
    isSpeaking: state === 'speaking',
    isError: state === 'error'
  };
}
