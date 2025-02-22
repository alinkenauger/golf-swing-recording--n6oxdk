import React, { useState, useEffect, useCallback, useRef } from 'react'; // ^18.2.0
import { useErrorBoundary } from 'react-error-boundary'; // ^4.0.0
import { AudioVisualizer } from 'react-audio-visualizer'; // ^1.0.0
import { useVideo } from '../../hooks/useVideo';
import { Button } from '../common/Button';

// Constants for audio configuration
const AUDIO_FORMATS = {
  webm: 'audio/webm',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg'
} as const;

const MAX_RECORDING_DURATION_MS = 300000; // 5 minutes
const BUFFER_SIZE = 16384;
const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds

interface VoiceOverRecorderProps {
  videoId: string;
  currentTime: number;
  onComplete: (audioBlob: Blob) => void;
  visualizerOptions?: {
    width: number;
    height: number;
    barWidth: number;
    barGap: number;
    barColor: string;
  };
}

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioChunks: Blob[];
}

export const VoiceOverRecorder: React.FC<VoiceOverRecorderProps> = ({
  videoId,
  currentTime,
  onComplete,
  visualizerOptions = {
    width: 600,
    height: 100,
    barWidth: 2,
    barGap: 1,
    barColor: '#2D5BFF'
  }
}) => {
  const { addVoiceOver } = useVideo();
  const { showBoundary } = useErrorBoundary();

  // Refs for audio handling
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const autoSaveIntervalRef = useRef<number>();

  // State management
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioChunks: []
  });

  // Initialize audio recorder with optimal settings
  const initializeRecorder = useCallback(async (stream: MediaStream): Promise<MediaRecorder> => {
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = BUFFER_SIZE;
      source.connect(analyser);
      
      // Store refs for cleanup
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Determine optimal audio format
      const supportedFormats = Object.entries(AUDIO_FORMATS)
        .filter(([_, mimeType]) => MediaRecorder.isTypeSupported(mimeType));
      
      if (!supportedFormats.length) {
        throw new Error('No supported audio formats found');
      }

      const [_, mimeType] = supportedFormats[0];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      return recorder;
    } catch (error) {
      showBoundary(error);
      throw error;
    }
  }, [showBoundary]);

  // Process recorded audio chunks
  const processAudioChunk = useCallback(async (chunk: Blob): Promise<Blob> => {
    try {
      // Update visualization data if analyser is available
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        // Update visualizer with new data
      }

      setRecordingState(prev => ({
        ...prev,
        audioChunks: [...prev.audioChunks, chunk]
      }));

      return chunk;
    } catch (error) {
      showBoundary(error);
      throw error;
    }
  }, [showBoundary]);

  // Start recording with enhanced error handling
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const recorder = await initializeRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          await processAudioChunk(event.data);
        }
      };

      recorder.start(1000); // Collect data every second

      setRecordingState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        duration: 0
      }));

      // Setup auto-save interval
      autoSaveIntervalRef.current = window.setInterval(() => {
        if (recordingState.audioChunks.length > 0) {
          const audioBlob = new Blob(recordingState.audioChunks, { 
            type: recorder.mimeType 
          });
          onComplete(audioBlob);
        }
      }, AUTO_SAVE_INTERVAL_MS);

    } catch (error) {
      showBoundary(error);
    }
  }, [initializeRecorder, processAudioChunk, onComplete, recordingState.audioChunks, showBoundary]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (recorderRef.current && recordingState.isRecording) {
      recorderRef.current.pause();
      setRecordingState(prev => ({ ...prev, isPaused: true }));
    }
  }, [recordingState.isRecording]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (recorderRef.current && recordingState.isPaused) {
      recorderRef.current.resume();
      setRecordingState(prev => ({ ...prev, isPaused: false }));
    }
  }, [recordingState.isPaused]);

  // Stop recording and process final audio
  const stopRecording = useCallback(async () => {
    if (recorderRef.current && recordingState.isRecording) {
      recorderRef.current.stop();
      recorderRef.current.stream.getTracks().forEach(track => track.stop());

      const audioBlob = new Blob(recordingState.audioChunks, { 
        type: recorderRef.current.mimeType 
      });

      try {
        await addVoiceOver(videoId, audioBlob, {
          startTime: currentTime,
          duration: recordingState.duration,
          volume: 1,
          quality: 'high'
        });

        onComplete(audioBlob);
      } catch (error) {
        showBoundary(error);
      }

      setRecordingState({
        isRecording: false,
        isPaused: false,
        duration: 0,
        audioChunks: []
      });
    }
  }, [videoId, currentTime, recordingState, addVoiceOver, onComplete, showBoundary]);

  // Update duration during recording
  useEffect(() => {
    let durationInterval: number;

    if (recordingState.isRecording && !recordingState.isPaused) {
      durationInterval = window.setInterval(() => {
        setRecordingState(prev => {
          const newDuration = prev.duration + 1000;
          if (newDuration >= MAX_RECORDING_DURATION_MS) {
            stopRecording();
            return prev;
          }
          return { ...prev, duration: newDuration };
        });
      }, 1000);
    }

    return () => {
      if (durationInterval) {
        clearInterval(durationInterval);
      }
    };
  }, [recordingState.isRecording, recordingState.isPaused, stopRecording]);

  // Cleanup resources
  useEffect(() => {
    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (recorderRef.current) {
        recorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full">
        <AudioVisualizer
          {...visualizerOptions}
          data={analyserRef.current ? new Uint8Array(analyserRef.current.frequencyBinCount) : new Uint8Array()}
        />
      </div>

      <div className="flex items-center gap-2">
        {!recordingState.isRecording ? (
          <Button
            onClick={startRecording}
            variant="primary"
            startIcon={<span className="w-3 h-3 rounded-full bg-red-500" />}
          >
            Start Recording
          </Button>
        ) : (
          <>
            {recordingState.isPaused ? (
              <Button
                onClick={resumeRecording}
                variant="primary"
                startIcon={<span className="w-3 h-3 rounded-full bg-green-500" />}
              >
                Resume
              </Button>
            ) : (
              <Button
                onClick={pauseRecording}
                variant="secondary"
                startIcon={<span className="w-3 h-3 rounded-full bg-yellow-500" />}
              >
                Pause
              </Button>
            )}
            <Button
              onClick={stopRecording}
              variant="danger"
              startIcon={<span className="w-3 h-3 rounded-full bg-red-500" />}
            >
              Stop
            </Button>
          </>
        )}
      </div>

      {recordingState.isRecording && (
        <div className="text-sm text-gray-600">
          Recording: {Math.floor(recordingState.duration / 1000)}s
          {recordingState.isPaused && ' (Paused)'}
        </div>
      )}
    </div>
  );
};

export type { VoiceOverRecorderProps };