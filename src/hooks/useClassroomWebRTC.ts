import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresenceUser, UserRole } from '../types/smartboard';
import { apiUrl } from '../utils/api';

type WebRTCSignalMsg = {
  fromUserId: string;
  fromRole?: UserRole;
  signalType: string;
  payload: unknown;
};

type UseClassroomWebRTCArgs = {
  userId: string;
  userRole: UserRole;
  presence: PresenceUser[];
  screenSharingActive: boolean;
  sendSignal: (targetUserId: string, signalType: string, payload: unknown) => void;
  onScreenSharingStateChange: (active: boolean) => void;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

async function getRtcConfig(): Promise<RTCConfiguration> {
  try {
    const response = await fetch(apiUrl('/api/webrtc/ice-config'));
    if (!response.ok) return RTC_CONFIG;
    const data = await response.json();
    return Array.isArray(data.iceServers) && data.iceServers.length ? { iceServers: data.iceServers } : RTC_CONFIG;
  } catch {
    return RTC_CONFIG;
  }
}

export function useClassroomWebRTC({
  userId,
  userRole,
  presence,
  screenSharingActive,
  sendSignal,
  onScreenSharingStateChange,
}: UseClassroomWebRTCArgs) {
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [iceState, setIceState] = useState<RTCPeerConnectionState | 'idle'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const teacherPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerPeerRef = useRef<{ hostId: string; pc: RTCPeerConnection } | null>(null);

  const cleanupTeacherPeers = useCallback(() => {
    for (const pc of teacherPeersRef.current.values()) {
      try {
        pc.close();
      } catch {
        // ignore close errors
      }
    }
    teacherPeersRef.current.clear();
  }, []);

  const cleanupViewerPeer = useCallback(() => {
    if (viewerPeerRef.current) {
      try {
        viewerPeerRef.current.pc.close();
      } catch {
        // ignore close errors
      }
      viewerPeerRef.current = null;
    }
    setRemoteScreenStream(null);
    setIceState('idle');
  }, []);

  const stopBroadcast = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLocalScreenStream(null);
    setIceState('idle');
    setConnectionError(null);
    cleanupTeacherPeers();
    onScreenSharingStateChange(false);
    sendSignal('', 'stream_stopped', null);
  }, [cleanupTeacherPeers, onScreenSharingStateChange, sendSignal]);

  const createOfferForPeer = useCallback(
    async (targetUserId: string, stream: MediaStream) => {
      if (!targetUserId || targetUserId === userId) return;
      const existing = teacherPeersRef.current.get(targetUserId);
      if (existing) {
        try {
          existing.close();
        } catch {
          // ignore
        }
      }
      const pc = new RTCPeerConnection(await getRtcConfig());
      teacherPeersRef.current.set(targetUserId, pc);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendSignal(targetUserId, 'ice', ev.candidate.toJSON());
        }
      };
      pc.onconnectionstatechange = () => {
        setIceState(pc.connectionState);
        if (pc.connectionState === 'failed') {
          setConnectionError('WebRTC peer connection failed. Try reconnecting.');
          teacherPeersRef.current.delete(targetUserId);
        } else if (pc.connectionState === 'connected') {
          setConnectionError(null);
        } else if (pc.connectionState === 'closed') {
          teacherPeersRef.current.delete(targetUserId);
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(targetUserId, 'offer', pc.localDescription);
      } catch {
        // ignore WebRTC negotiation errors if peer left
      }
    },
    [sendSignal, userId]
  );

  const startBroadcast = useCallback(
    async (includeAudio = false) => {
      setConnectionError(null);
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: includeAudio });
        localStreamRef.current = stream;
        setLocalScreenStream(stream);
        setIceState('connecting');
        onScreenSharingStateChange(true);

        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          stopBroadcast();
        });

        for (const peer of presence) {
          if (peer.userId !== userId) {
            void createOfferForPeer(peer.userId, stream);
          }
        }
        sendSignal('', 'stream_ready', null);
        return stream;
      } catch (err) {
        setConnectionError(err instanceof Error ? err.message : 'Screen capture permission cancelled.');
        return null;
      }
    },
    [createOfferForPeer, onScreenSharingStateChange, presence, sendSignal, stopBroadcast, userId]
  );

  const reconnectViewer = useCallback(() => {
    cleanupViewerPeer();
    setConnectionError(null);
    if (screenSharingActive && userRole !== 'teacher') {
      setIceState('connecting');
      sendSignal('', 'request_stream', null);
    }
  }, [cleanupViewerPeer, screenSharingActive, sendSignal, userRole]);

  // If teacher is sharing and new collaborators join, initiate WebRTC offer to them
  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream || userRole !== 'teacher') return;
    for (const peer of presence) {
      if (peer.userId !== userId && !teacherPeersRef.current.has(peer.userId)) {
        void createOfferForPeer(peer.userId, stream);
      }
    }
  }, [createOfferForPeer, presence, userId, userRole]);

  // If student joins while teacher screen share is already active, request stream
  useEffect(() => {
    if (screenSharingActive && userRole !== 'teacher' && !remoteScreenStream) {
      setIceState('connecting');
      sendSignal('', 'request_stream', null);
    } else if (!screenSharingActive && remoteScreenStream) {
      cleanupViewerPeer();
    }
  }, [cleanupViewerPeer, remoteScreenStream, screenSharingActive, sendSignal, userRole]);

  const handleWebRTCSignal = useCallback(
    async (msg: WebRTCSignalMsg) => {
      const { fromUserId, signalType, payload } = msg;
      if (!fromUserId || fromUserId === userId) return;

      // Teacher host receives viewer answers / ICE / stream requests
      if (localStreamRef.current) {
        if (signalType === 'request_stream') {
          await createOfferForPeer(fromUserId, localStreamRef.current);
          return;
        }
        const pc = teacherPeersRef.current.get(fromUserId);
        if (!pc) return;
        if (signalType === 'answer' && payload) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          } catch {
            // ignore
          }
        } else if (signalType === 'ice' && payload) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit));
          } catch {
            // ignore
          }
        }
        return;
      }

      // Viewer receives host offer / ICE / stop notifications
      if (signalType === 'stream_stopped') {
        cleanupViewerPeer();
        return;
      }
      if (signalType === 'stream_ready' && !viewerPeerRef.current) {
        sendSignal(fromUserId, 'request_stream', null);
        return;
      }
      if (signalType === 'offer' && payload) {
        cleanupViewerPeer();
        const pc = new RTCPeerConnection(await getRtcConfig());
        viewerPeerRef.current = { hostId: fromUserId, pc };
        setIceState('connecting');
        setConnectionError(null);
        pc.ontrack = (ev) => {
          const [stream] = ev.streams;
          if (stream) setRemoteScreenStream(stream);
        };
        pc.onconnectionstatechange = () => {
          setIceState(pc.connectionState);
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            setConnectionError('Screen stream interrupted. Click Reconnect to restore.');
          } else if (pc.connectionState === 'connected') {
            setConnectionError(null);
          }
        };
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            sendSignal(fromUserId, 'ice', ev.candidate.toJSON());
          }
        };
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(fromUserId, 'answer', pc.localDescription);
        } catch {
          setConnectionError('Failed to establish screen share connection.');
          cleanupViewerPeer();
        }
      } else if (signalType === 'ice' && payload && viewerPeerRef.current?.hostId === fromUserId) {
        try {
          await viewerPeerRef.current.pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit));
        } catch {
          // ignore
        }
      }
    },
    [cleanupViewerPeer, createOfferForPeer, sendSignal, userId]
  );

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      cleanupTeacherPeers();
      cleanupViewerPeer();
    };
  }, [cleanupTeacherPeers, cleanupViewerPeer]);

  return {
    localScreenStream,
    remoteScreenStream,
    iceState,
    connectionError,
    startBroadcast,
    stopBroadcast,
    reconnectViewer,
    handleWebRTCSignal,
  };
}
