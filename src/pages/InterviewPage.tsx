import React, { useState, useEffect, useRef } from 'react';
import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';
import { Button } from '../components/button/Button';
import './InterviewPage.scss';

interface InterviewPageProps {
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  isRecordingListen: boolean;
}

export function InterviewPage({ startListening, stopListening, isRecordingListen }: InterviewPageProps) {
  const LOCAL_RELAY_SERVER_URL: string = process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';
  const apiKey = LOCAL_RELAY_SERVER_URL ? '' : localStorage.getItem('tmp::voice_api_key') || prompt('OpenAI API Key') || '';
  if (apiKey !== '') {
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }

  const wavRecorderRef = useRef<WavRecorder>(new WavRecorder({ sampleRate: 24000 }));
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(new WavStreamPlayer({ sampleRate: 24000 }));
  const clientRef = useRef<RealtimeClient>(new RealtimeClient(
    LOCAL_RELAY_SERVER_URL ? { url: LOCAL_RELAY_SERVER_URL } : { apiKey: apiKey, dangerouslyAllowAPIKeyInBrowser: true }
  ));

  const [items, setItems] = useState<ItemType[]>([]);

  useEffect(() => {
    const client = clientRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    client.updateSession({ instructions: instructions });
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(item.formatted.audio, 24000, 24000);
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      client.reset();
    };
  }, []);

  return (
    <div data-component="InterviewPage">
      <div className="content-main">
        <div className="content-logs">
          <div className="content-block conversation" style={{ marginTop: '40px', height: '70vh' }}>
            <div className="content-block-title">Interview</div>
            <div className="content-block-body" data-conversation-content>
              {!items.length && `Awaiting connection...`}
              {items.map((conversationItem, i) => {
                return (
                  <div className="conversation-item" key={conversationItem.id}>
                    <div className={`speaker ${conversationItem.role || ''}`}>
                      <div>
                        {(conversationItem.role || conversationItem.type).replaceAll('_', ' ')}
                      </div>
                    </div>
                    <div className={`speaker-content`}>
                      {conversationItem.type === 'function_call_output' && (
                        <div>{conversationItem.formatted.output}</div>
                      )}
                      {!!conversationItem.formatted.tool && (
                        <div>
                          {conversationItem.formatted.tool.name}({conversationItem.formatted.tool.arguments})
                        </div>
                      )}
                      {!conversationItem.formatted.tool && conversationItem.role === 'user' && (
                        <div>
                          {conversationItem.formatted.transcript ||
                            (conversationItem.formatted.audio?.length
                              ? '(awaiting transcript)'
                              : conversationItem.formatted.text || '(item sent)')}
                        </div>
                      )}
                      {!conversationItem.formatted.tool && conversationItem.role === 'assistant' && (
                        <div>
                          {conversationItem.formatted.transcript || conversationItem.formatted.text || '(truncated)'}
                        </div>
                      )}
                      {conversationItem.formatted.file && (
                        <audio src={conversationItem.formatted.file.url} controls />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="content-actions">
            <Button
              label={isRecordingListen ? 'Stop Listening' : 'Start Listening'}
              buttonStyle={isRecordingListen ? 'alert' : 'regular'}
              onClick={isRecordingListen ? stopListening : startListening}
            />
          </div>
        </div>
      </div>
    </div>
  );
}