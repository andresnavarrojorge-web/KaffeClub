import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Coffee,
  Search,
  UserPlus,
  Bell,
  CheckCircle2,
  Clock,
  Download,
  Sparkles,
  LogOut,
  Edit3,
  Trash2,
  CreditCard,
  Send,
  Calendar,
  ShieldAlert,
  Copy,
  Check,
  Users,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  COFFEE_VARIETIES,
  CoffeeClaimRecord,
  MemberRecord,
  OWNER_EMAIL,
  SHARED_APP_URL,
  StaffInviteRecord,
  emailToInviteId,
  getDaysWithoutClaim,
  getOffsetDateString,
  getTodayDateString,
  hasClaimedToday,
  isBirthdayTodayOrMonth,
  isInactiveForFiveDays,
} from './utils/membership';
import { RegisterMemberModal } from './components/RegisterMemberModal';
import { MemberCardModal } from './components/MemberCardModal';
import { ReminderModal } from './components/ReminderModal';
import { StaffManagerPanel } from './components/StaffManagerPanel';

type NavTab = 'overview' | 'directory' | 'inactive' | 'history' | 'staff';
type DirectoryFilter =
  | 'all'
  | 'available_today'
  | 'claimed_today'
  | 'inactive_5d'
  | 'birthdays';
type AccessStatus = 'checking' | 'authorized' | 'unauthorized';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');

  const [accessStatus, setAccessStatus] = useState<AccessStatus>('checking');
  const [staffProfileName, setStaffProfileName] = useState('');
  const [teamEmails, setTeamEmails] = useState<string[]>([OWNER_EMAIL]);
  const [staffInvites, setStaffInvites] = useState<StaffInviteRecord[]>([]);

  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [claims, setClaims] = useState<CoffeeClaimRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [directoryFilter, setDirectoryFilter] = useState<DirectoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickLookupQuery, setQuickLookupQuery] = useState('');

  const [selectedCoffeeType, setSelectedCoffeeType] = useState<string>(
    COFFEE_VARIETIES[0]
  );
  const [baristaName, setBaristaName] = useState('Barra Principal');

  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberRecord | null>(null);
  const [cardModalMember, setCardModalMember] = useState<MemberRecord | null>(null);
  const [reminderModalMember, setReminderModalMember] = useState<MemberRecord | null>(
    null
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [claimingMemberId, setClaimingMemberId] = useState<string | null>(null);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'warning';
    text: string;
  } | null>(null);

  const migratedLegacyRef = useRef(false);
  const todayStr = useMemo(() => getTodayDateString(), []);

  const isAdmin = useMemo(() => {
    return Boolean(
      user?.email && user.email.toLowerCase().trim() === OWNER_EMAIL
    );
  }, [user]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Verify whether the signed-in user is the Owner or an Authorized Employee (Checking both staff_invites and empleados)
  useEffect(() => {
    if (!authReady) return;
    if (!user || !user.email) {
      setAccessStatus('checking');
      setMembers([]);
      setClaims([]);
      setStaffInvites([]);
      setDataLoading(false);
      return;
    }

    const userEmail = user.email.toLowerCase().trim();

    if (userEmail === OWNER_EMAIL) {
      setAccessStatus('authorized');
      setStaffProfileName(user.displayName || 'Administrador');
      setBaristaName(user.displayName?.split(' ')[0] || 'Administrador');
      return;
    }

    let cancelled = false;
    setAccessStatus('checking');
    const inviteId = emailToInviteId(userEmail);

    const verifyEmployeeAccess = async () => {
      try {
        // 1. Check in 'staff_invites' or 'empleados' collection
        let isAuthorized = false;
        let empName = user.displayName || 'Empleado';
        let loadedTeamEmails: string[] = [OWNER_EMAIL, userEmail];

        const inviteRef = doc(db, 'staff_invites', inviteId);
        const inviteSnap = await getDoc(inviteRef);

        if (inviteSnap.exists()) {
          const inviteData = inviteSnap.data();
          if (inviteData.status === 'active') {
            isAuthorized = true;
            empName = String(inviteData.name || empName);
            if (Array.isArray(inviteData.teamEmails)) {
              loadedTeamEmails = inviteData.teamEmails.map((e: unknown) => String(e).toLowerCase());
            }
          }
        } else {
          // Fallback check in 'empleados' collection (created manually or via web)
          const empleadoRef = doc(db, 'empleados', userEmail);
          const empleadoSnap = await getDoc(empleadoRef);
          if (empleadoSnap.exists()) {
            const empData = empleadoSnap.data();
            isAuthorized = true;
            empName = String(empData.nombre || empData.name || empName);
          }
        }

        if (cancelled) return;

        if (!isAuthorized) {
          setAccessStatus('unauthorized');
          setDataLoading(false);
          return;
        }

        setTeamEmails(
          Array.from(new Set([OWNER_EMAIL, userEmail, ...loadedTeamEmails])).slice(
            0,
            10
          )
        );
        setStaffProfileName(empName);
        setBaristaName(empName.split(' ')[0] || 'Barra');

        // Activate session record
        const staffSessionRef = doc(db, 'staff', user.uid);
        const existingSession = await getDoc(staffSessionRef);
        if (existingSession.exists()) {
          await updateDoc(staffSessionRef, {
            inviteId,
            status: 'active',
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(staffSessionRef, {
            uid: user.uid,
            email: userEmail,
            inviteId,
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (!cancelled) {
          setAccessStatus('authorized');
        }
      } catch (error) {
        console.error('Error verifying staff access:', error);
        if (!cancelled) {
          setAccessStatus('unauthorized');
          setDataLoading(false);
        }
      }
    };

    verifyEmployeeAccess();
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  // Attach real-time listeners once accessStatus === 'authorized'
  useEffect(() => {
    if (!authReady || !user || !user.email || accessStatus !== 'authorized') {
      return;
    }

    const userEmail = user.email.toLowerCase().trim();
    setDataLoading(true);

    // 1. Staff Invites listener (checking both staff_invites and empleados)
    const invitesQuery = query(collection(db, 'staff_invites'));
    const unsubInvites = onSnapshot(
      invitesQuery,
      (snapshot) => {
        let loaded: StaffInviteRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            email: String(data.email || data.correo || '').toLowerCase(),
            name: String(data.name || data.nombre || ''),
            role: (data.role === 'manager' || data.rol === 'manager') ? 'manager' : 'employee',
            status: data.status === 'revoked' ? 'revoked' : 'active',
            teamEmails: Array.isArray(data.teamEmails)
              ? data.teamEmails.map(String)
              : [OWNER_EMAIL],
            createdByUid: String(data.createdByUid || ''),
            updatedByUid: String(data.updatedByUid || ''),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });

        loaded.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        setStaffInvites(loaded);

        const activeEmails = loaded
          .filter((inv) => inv.status === 'active')
          .map((inv) => inv.email.toLowerCase());
        const merged = Array.from(new Set([OWNER_EMAIL, ...activeEmails])).slice(
          0,
          10
        );
        setTeamEmails(merged);

        if (!isAdmin) {
          const myInvite = loaded.find((inv) => inv.email === userEmail);
          if (myInvite && myInvite.status !== 'active') {
            setAccessStatus('unauthorized');
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'staff_invites');
      }
    );

    // 2. Members listener
    const membersQuery = query(collection(db, 'members'));
    const unsubMembers = onSnapshot(
      membersQuery,
      (snapshot) => {
        const loaded: MemberRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            memberCode: String(data.memberCode || ''),
            name: String(data.name || ''),
            birthDate: String(data.birthDate || ''),
            phone: String(data.phone || ''),
            totalClaims: Number(data.totalClaims || 0),
            lastClaimDate: String(data.lastClaimDate || ''),
            lastReminderSentDate: String(data.lastReminderSentDate || ''),
            status: data.status === 'archived' ? 'archived' : 'active',
            staffEmails: Array.isArray(data.staffEmails)
              ? data.staffEmails.map(String)
              : [OWNER_EMAIL],
            createdByUid: String(data.createdByUid || user.uid),
            updatedByUid: String(data.updatedByUid || user.uid),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        loaded.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        setMembers(loaded);
        setDataLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'members');
      }
    );

    // 3. Claims listener
    const claimsQuery = query(collection(db, 'claims'));
    const unsubClaims = onSnapshot(
      claimsQuery,
      (snapshot) => {
        const loaded: CoffeeClaimRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            memberId: String(data.memberId || ''),
            memberCode: String(data.memberCode || ''),
            memberName: String(data.memberName || ''),
            claimDate: String(data.claimDate || ''),
            coffeeType: String(data.coffeeType || ''),
            servedBy: String(data.servedBy || ''),
            staffEmails: Array.isArray(data.staffEmails)
              ? data.staffEmails.map(String)
              : [OWNER_EMAIL],
            createdByUid: String(data.createdByUid || user.uid),
            createdAt: data.createdAt || null,
          };
        });
        loaded.sort((a, b) => {
          if (b.claimDate !== a.claimDate) {
            return b.claimDate.localeCompare(a.claimDate);
          }
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        setClaims(loaded);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'claims');
      }
    );

    return () => {
      unsubInvites();
      unsubMembers();
      unsubClaims();
    };
  }, [authReady, user, accessStatus, isAdmin]);

  const showNotice = (text: string, type: 'success' | 'warning' = 'success') => {
    setFeedbackBanner({ text, type });
    setTimeout(() => {
      setFeedbackBanner((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const handleLogin = async () => {
    setSigningIn(true);
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar sesión con Google.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // Function to add staff and save to both 'staff_invites' and 'empleados' for permanent persistence
  const handleAddStaff = async (data: {
    email: string;
    name: string;
    role: 'employee' | 'manager';
  }) => {
    if (!user) return;
    const cleanEmail = data.email.toLowerCase().trim();
    const inviteId = cleanEmail;
    const activeEmails = staffInvites
      .filter((inv) => inv.status === 'active' && inv.id !== inviteId)
      .map((inv) => inv.email.toLowerCase());
    const updatedTeamEmails = Array.from(
      new Set([OWNER_EMAIL, ...activeEmails, cleanEmail])
    ).slice(0, 10);

    try {
      // 1. Save in staff_invites collection
      await setDoc(doc(db, 'staff_invites', inviteId), {
        email: cleanEmail,
        name: data.name,
        role: data.role,
        status: 'active',
        teamEmails: updatedTeamEmails,
        createdByUid: user.uid,
        updatedByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 2. Also save in 'empleados' collection so it matches manual DB entries perfectly
      await setDoc(doc(db, 'empleados', cleanEmail), {
        correo: cleanEmail,
        nombre: data.name,
        rol: data.role === 'manager' ? 'manager' : 'empleado',
        status: 'active',
        updatedAt: serverTimestamp(),
      }, { merge: true });

      showNotice(
        `Empleado autorizado y guardado en la nube: ${data.name} (${cleanEmail}).`
      );
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `staff_invites/${inviteId}`
      );
    }
  };

  const handleToggleStaffStatus = async (invite: StaffInviteRecord) => {
    if (!user) return;
    const nextStatus = invite.status === 'active' ? 'revoked' : 'active';
    try {
      await updateDoc(doc(db, 'staff_invites', invite.id), {
        status: nextStatus,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'empleados', invite.email), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });

      showNotice(
        nextStatus === 'active'
          ? `Acceso reactivado para ${invite.name} (${invite.email}).`
          : `Acceso suspendido para ${invite.name} (${invite.email}).`
      );
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `staff_invites/${invite.id}`
      );
    }
  };

  const handleDeleteStaffInvite = async (invite: StaffInviteRecord) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'staff_invites', invite.id));
      await deleteDoc(doc(db, 'empleados', invite.email));
      showNotice(`Autorización eliminada para ${invite.email}.`);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `staff_invites/${invite.id}`
      );
    }
  };

  const existingCodes = useMemo(() => {
    return new Set(members.map((m) => m.memberCode.toUpperCase()));
  }, [members]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === 'active'),
    [members]
  );

  const claimedTodayMembers = useMemo(
    () => activeMembers.filter((m) => hasClaimedToday(m, todayStr)),
    [activeMembers, todayStr]
  );

  const inactiveFiveDaysMembers = useMemo(() => {
    return activeMembers
      .filter((m) => isInactiveForFiveDays(m, todayStr))
      .sort(
        (a, b) =>
          getDaysWithoutClaim(b, todayStr) - getDaysWithoutClaim(a, todayStr)
      );
  }, [activeMembers, todayStr]);

  const totalHistoricalClaims = useMemo(
    () => activeMembers.reduce((acc, m) => acc + m.totalClaims, 0),
    [activeMembers]
  );

  const birthdaysThisMonthCount = useMemo(
    () =>
      activeMembers.filter(
        (m) => isBirthdayTodayOrMonth(m.birthDate, todayStr).isThisMonth
      ).length,
    [activeMembers, todayStr]
  );

  const quickLookupResults = useMemo(() => {
    const q = quickLookupQuery.trim().toLowerCase();
    if (!q) return activeMembers.slice(0, 5);
    return activeMembers
      .filter(
        (m) =>
          m.memberCode.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.phone.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [activeMembers, quickLookupQuery]);

  const filteredDirectoryMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeMembers.filter((m) => {
      if (directoryFilter === 'available_today' && hasClaimedToday(m, todayStr)) {
        return false;
      }
      if (directoryFilter === 'claimed_today' && !hasClaimedToday(m, todayStr)) {
        return false;
      }
      if (
        directoryFilter === 'inactive_5d' &&
        !isInactiveForFiveDays(m, todayStr)
      ) {
        return false;
      }
      if (
        directoryFilter === 'birthdays' &&
        !isBirthdayTodayOrMonth(m.birthDate, todayStr).isThisMonth
      ) {
        return false;
      }
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q)
      );
    });
  }, [activeMembers, directoryFilter, searchQuery, todayStr]);

  const currentBoundedStaffEmails = useMemo(() => {
    const userEmail = user?.email?.toLowerCase().trim();
    const list = userEmail
      ? [OWNER_EMAIL, userEmail, ...teamEmails]
      : [OWNER_EMAIL, ...teamEmails];
    return Array.from(new Set(list)).slice(0, 10);
  }, [teamEmails, user]);

  const handleSaveMember = async (data: {
    memberCode: string;
    name: string;
    birthDate: string;
    phone: string;
  }) => {
    if (!user) return;

    if (editingMember) {
      const docPath = `members/${editingMember.id}`;
      try {
        await updateDoc(doc(db, 'members', editingMember.id), {
          name: data.name,
          birthDate: data.birthDate,
          phone: data.phone,
          status: editingMember.status,
          staffEmails: currentBoundedStaffEmails,
          createdByUid: editingMember.createdByUid || user.uid,
          updatedByUid: user.uid,
          updatedAt: serverTimestamp(),
        });
        showNotice(`Datos actualizados para ${data.name} (${data.memberCode}).`);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      }
    } else {
      const safeId = `mem_${data.memberCode.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()
        .toString(36)
        .slice(-5)}`;
      const docPath = `members/${safeId}`;
      try {
        await setDoc(doc(db, 'members', safeId), {
          memberCode: data.memberCode,
          name: data.name,
          birthDate: data.birthDate,
          phone: data.phone,
          totalClaims: 0,
          lastClaimDate: '',
          lastReminderSentDate: '',
          status: 'active',
          staffEmails: currentBoundedStaffEmails,
          createdByUid: user.uid,
          updatedByUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showNotice(
          `Miembro registrado: ${data.name} con ID único ${data.memberCode}.`
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }
    }
  };

  const handleClaimDailyCoffee = async (member: MemberRecord) => {
    if (!user) return;
    if (hasClaimedToday(member, todayStr)) {
      showNotice(
        `${member.name} (${member.memberCode}) ya reclamó su café del día hoy (${todayStr}). Solo se permite 1 reclamo por día.`,
        'warning'
      );
      return;
    }

    setClaimingMemberId(member.id);
    const claimDocId = `${member.id}_${todayStr}`;
    const claimPath = `claims/${claimDocId}`;
    const barista =
      baristaName.trim() || staffProfileName || user.email || 'Barra Principal';

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'claims', claimDocId), {
        memberId: member.id,
        memberCode: member.memberCode,
        memberName: member.name,
        claimDate: todayStr,
        coffeeType: selectedCoffeeType,
        servedBy: barista.slice(0, 80),
        staffEmails: currentBoundedStaffEmails,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, 'members', member.id), {
        totalClaims: member.totalClaims + 1,
        lastClaimDate: todayStr,
        staffEmails: currentBoundedStaffEmails,
        createdByUid: member.createdByUid || user.uid,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      showNotice(
        `Café del Día (${selectedCoffeeType}) registrado para ${member.name} (${member.memberCode}).`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, claimPath);
    } finally {
      setClaimingMemberId(null);
    }
  };

  const handleMarkReminderSent = async (member: MemberRecord) => {
    if (!user) return;
    const docPath = `members/${member.id}`;
    try {
      await updateDoc(doc(db, 'members', member.id), {
        lastReminderSentDate: todayStr,
        staffEmails: currentBoundedStaffEmails,
        createdByUid: member.createdByUid || user.uid,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      showNotice(
        `Recordatorio registrado como enviado hoy para ${member.name} (${member.memberCode}).`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  };

  const handleDeleteMember = async (member: MemberRecord) => {
    if (!user) return;
    const docPath = `members/${member.id}`;
    try {
      await deleteDoc(doc(db, 'members', member.id));
      setConfirmDeleteId(null);
      showNotice(`Membresía ${member.memberCode} (${member.name}) eliminada.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  };

  const handleSeedDemoData = async () => {
    if (!user || seedingDemo) return;
    setSeedingDemo(true);
    try {
      const batch = writeBatch(db);
      const demoSamples = [
        {
          id: 'mem_kaf_2041',
          memberCode: 'KAF-2041',
          name: 'Mateo Restrepo',
          birthDate: '1993-10-26',
          phone: '+57 300 412 8890',
          totalClaims: 14,
          lastClaimDate: getOffsetDateString(8),
          coffeeType: 'Filtrado V60',
        },
        {
          id: 'mem_kaf_3819',
          memberCode: 'KAF-3819',
          name: 'Camila Mejía',
          birthDate: '1997-04-12',
          phone: '+57 311 654 3210',
          totalClaims: 9,
          lastClaimDate: getOffsetDateString(6),
          coffeeType: 'Cappuccino Artesanal',
        },
        {
          id: 'mem_kaf_5502',
          memberCode: 'KAF-5502',
          name: 'Andrés Villamizar',
          birthDate: '1989-10-18',
          phone: '+57 315 890 1122',
          totalClaims: 22,
          lastClaimDate: todayStr,
          coffeeType: 'Americano del Día (Origen)',
        },
        {
          id: 'mem_kaf_7190',
          memberCode: 'KAF-7190',
          name: 'Laura Castellanos',
          birthDate: '1995-08-03',
          phone: '+57 301 234 5678',
          totalClaims: 6,
          lastClaimDate: getOffsetDateString(1),
          coffeeType: 'Espresso Doble',
        },
        {
          id: 'mem_kaf_8934',
          memberCode: 'KAF-8934',
          name: 'Santiago Quintero',
          birthDate: '1991-12-22',
          phone: '+57 320 987 6543',
          totalClaims: 11,
          lastClaimDate: getOffsetDateString(5),
          coffeeType: 'Cold Brew 18h',
        },
      ];

      for (const sample of demoSamples) {
        if (existingCodes.has(sample.memberCode)) continue;
        batch.set(doc(db, 'members', sample.id), {
          memberCode: sample.memberCode,
          name: sample.name,
          birthDate: sample.birthDate,
          phone: sample.phone,
          totalClaims: sample.totalClaims,
          lastClaimDate: sample.lastClaimDate,
          lastReminderSentDate: '',
          status: 'active',
          staffEmails: currentBoundedStaffEmails,
          createdByUid: user.uid,
          updatedByUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const claimId = `${sample.id}_${sample.lastClaimDate}`;
        batch.set(doc(db, 'claims', claimId), {
          memberId: sample.id,
          memberCode: sample.memberCode,
          memberName: sample.name,
          claimDate: sample.lastClaimDate,
          coffeeType: sample.coffeeType,
          servedBy: staffProfileName || 'Barra Principal',
          staffEmails: currentBoundedStaffEmails,
          createdByUid: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      showNotice(
        'Se cargaron miembros de demostración compartidos con todo tu equipo autorizado.'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'members');
    } finally {
      setSeedingDemo(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'ID_Miembro',
      'Nombre',
      'Cumpleanos',
      'Telefono',
      'Total_Reclamos',
      'Ultimo_Reclamo',
      'Dias_Sin_Reclamar',
      'Alerta_5_Dias',
      'Ultimo_Recordatorio',
    ];
    const rows = activeMembers.map((m) => {
      const days = getDaysWithoutClaim(m, todayStr);
      const alert5d = days >= 5 ? 'SI' : 'NO';
      return [
        m.memberCode,
        `"${m.name.replace(/"/g, '""')}"`,
        m.birthDate,
        `"${m.phone}"`,
        String(m.totalClaims),
        m.lastClaimDate || 'Ninguno',
        String(days),
        alert5d,
        m.lastReminderSentDate || 'Ninguno',
      ].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kaffeclub_membresias_${todayStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!authReady || (user && accessStatus === 'checking')) {
    return (
      <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center p-6">
        <div className="text-sm text-zinc-500 font-mono">
          Verificando credenciales y permisos de acceso...
        </div>
      </div>
    );
  }

  // Unauthenticated Landing Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-[#faf9f6] flex flex-col justify-between">
        <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 border-b border-zinc-200 bg-white">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
          >
            KaffeClub
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600">
            <a
              href="#beneficios"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Registro Único
            </a>
            <a
              href="#beneficios"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Bono Diario
            </a>
            <a
              href="#beneficios"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Alertas +5 Días
            </a>
            <a
              href="#beneficios"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Acceso Empleados
            </a>
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={signingIn}
              onClick={handleLogin}
              className="px-4 py-2 text-xs font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {signingIn ? 'Conectando...' : 'Iniciar Sesión'}
            </button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto w-full px-6 py-12 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <p className="text-xs font-medium text-amber-800 mb-3">
                Acceso Exclusivo para Personal Autorizado · Móvil y Barra
              </p>
              <h1
                className="text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-zinc-900 leading-[1.15]"
                style={{ textWrap: 'balance' }}
              >
                Base de datos de membresías y control del Café del Día.
              </h1>
              <p className="mt-4 text-base text-zinc-600 leading-relaxed max-w-xl">
                Inicia sesión con tu correo de Google autorizado para registrar
                nuevos miembros desde tu teléfono, validar su ID único, entregar su
                café diario (máximo 1 por día) y enviar recordatorios a quienes
                llevan más de 5 días sin visitarnos.
              </p>

              {authError && (
                <p className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 max-w-md">
                  {authError}
                </p>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={handleLogin}
                  className="px-5 py-3 text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {signingIn
                    ? 'Iniciando sesión...'
                    : 'Entrar con Correo de Empleado / Admin'}
                </button>
                <span className="text-xs text-zinc-500">
                  Sincronización segura en la nube sin pérdida de datos
                </span>
              </div>
            </div>

            <div
              id="beneficios"
              className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6 flex flex-col justify-between space-y-6"
            >
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">
                  Seguridad y control para tu equipo
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Diseñado para que tus empleados operen desde sus teléfonos.
                </p>
              </div>

              <div className="space-y-5 text-sm">
                <div className="pb-4 border-b border-zinc-100">
                  <div className="font-semibold text-zinc-900">
                    01. Acceso Restringido por Correo
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">
                    Solamente el administrador y los correos de empleados
                    autorizados pueden ver y registrar miembros.
                  </p>
                </div>

                <div className="pb-4 border-b border-zinc-100">
                  <div className="font-semibold text-zinc-900">
                    02. Protección contra Pérdida de Información
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">
                    Todos los cambios se guardan en tiempo real en la nube y los
                    empleados no pueden eliminar membresías ni historiales.
                  </p>
                </div>

                <div>
                  <div className="font-semibold text-zinc-900">
                    03. Control Diario y Alertas a los 5 Días
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">
                    Bloqueo automático de 1 café por día por socio y envío directo
                    de recordatorios por WhatsApp o SMS desde el celular.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>

        <footer className="px-6 lg:px-10 py-5 border-t border-zinc-200 text-xs text-zinc-500 flex items-center justify-between">
          <span>KaffeClub · Sistema Seguro para Empleados y Administración</span>
          <span className="font-mono tabular-nums">{todayStr}</span>
        </footer>
      </div>
    );
  }

  // Unauthorized Email Lock Screen
  if (accessStatus === 'unauthorized') {
    const userEmail = user.email || '';
    const handleCopyMyEmail = async () => {
      await navigator.clipboard.writeText(userEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    };

    return (
      <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3 text-amber-800">
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-800">
                Acceso Restringido · KaffeClub
              </p>
              <h1 className="text-lg font-bold text-zinc-900">
                Correo aún no autorizado
              </h1>
            </div>
          </div>

          <p className="text-xs text-zinc-600 leading-relaxed">
            Por seguridad de la base de datos de membresías, únicamente los
            empleados autorizados por el administrador (
            <span className="font-mono text-zinc-900">{OWNER_EMAIL}</span>) pueden
            acceder a la información y registrar socios.
          </p>

          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] text-zinc-500 block">
                Tu correo actual:
              </span>
              <span className="text-xs font-mono font-semibold text-zinc-900 truncate block mt-0.5">
                {userEmail}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyMyEmail}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-md transition-colors shrink-0 cursor-pointer"
            >
              {copiedEmail ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar correo</span>
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-zinc-500">
            Envía este correo al administrador para que lo agregue en la pestaña{' '}
            <strong>"Equipo y Enlace"</strong> y luego recarga esta página.
          </p>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-200">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              Ya me autorizaron · Verificar
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
            >
              Cambiar de cuenta
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authorized Workspace
  return (
    <div className="min-h-screen bg-[#faf9f6] flex flex-col">
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 border-b border-zinc-200 bg-white sticky top-0 z-30">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('overview');
          }}
          className="text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
        >
          KaffeClub
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'overview'
                ? 'text-zinc-900 border-b-2 border-zinc-900 font-semibold'
                : 'hover:text-zinc-900'
            }`}
          >
            Panel General
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'directory'
                ? 'text-zinc-900 border-b-2 border-zinc-900 font-semibold'
                : 'hover:text-zinc-900'
            }`}
          >
            Base de Miembros
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('inactive')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'inactive'
                ? 'text-zinc-900 border-b-2 border-zinc-900 font-semibold'
                : 'hover:text-zinc-900'
            }`}
          >
            Alertas +5 Días ({inactiveFiveDaysMembers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'history'
                ? 'text-zinc-900 border-b-2 border-zinc-900 font-semibold'
                : 'hover:text-zinc-900'
            }`}
          >
            Historial Diario
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('staff')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'staff'
                ? 'text-zinc-900 border-b-2 border-zinc-900 font-semibold'
                : 'hover:text-zinc-900'
            }`}
          >
            Equipo y Enlace
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setEditingMember(null);
              setIsRegisterModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Registrar Miembro</span>
          </button>
        </div>
      </header>

      <div className="flex md:hidden items-center gap-2 px-4 py-2.5 bg-white border-b border-zinc-200 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeTab === 'overview'
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          Panel General
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('directory')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeTab === 'directory'
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          Miembros ({activeMembers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('inactive')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeTab === 'inactive'
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          Alertas +5d ({inactiveFiveDaysMembers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeTab === 'history'
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          Historial
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('staff')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeTab === 'staff'
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          Equipo y Enlace
        </button>
      </div>

      <main className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 flex-1 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-zinc-200">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>{isAdmin ? 'Rol: Administrador Propietario' : 'Rol: Empleado Autorizado'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-zinc-800">{user.email}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums font-medium text-zinc-800">
                {todayStr}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 mt-1">
              Control de Membresías y Reclamo del Café del Día
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-1.5">
              <Coffee className="w-3.5 h-3.5 text-amber-800 shrink-0" />
              <label
                htmlFor="coffee-select"
                className="text-xs text-zinc-500 shrink-0"
              >
                Café:
              </label>
              <select
                id="coffee-select"
                value={selectedCoffeeType}
                onChange={(e) => setSelectedCoffeeType(e.target.value)}
                className="text-xs font-medium text-zinc-900 bg-transparent focus:outline-none cursor-pointer"
              >
                {COFFEE_VARIETIES.map((variety) => (
                  <option key={variety} value={variety}>
                    {variety}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-1.5">
              <label
                htmlFor="barista-input"
                className="text-xs text-zinc-500 shrink-0"
              >
                Atiende:
              </label>
              <input
                id="barista-input"
                type="text"
                maxLength={40}
                value={baristaName}
                onChange={(e) => setBaristaName(e.target.value)}
                className="text-xs font-medium text-zinc-900 w-28 focus:outline-none"
              />
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('staff')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>
                  Empleados ({staffInvites.filter((s) => s.status === 'active').length})
                </span>
              </button>
            )}

            {activeMembers.length === 0 && (
              <button
                type="button"
                disabled={seedingDemo}
                onClick={handleSeedDemoData}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {seedingDemo ? 'Cargando...' : 'Cargar Miembros de Ejemplo'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={activeMembers.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 disabled:opacity-40 border border-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Salir</span>
            </button>
          </div>
        </div>

        {feedbackBanner && (
          <div
            className={`px-4 py-3 rounded-lg border text-xs font-medium flex items-center justify-between ${
              feedbackBanner.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <span>{feedbackBanner.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-xs underline ml-4 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <span className="text-xs text-zinc-500 block">
              Miembros Registrados
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono tabular-nums text-zinc-900">
                {activeMembers.length}
              </span>
              <span className="text-xs text-zinc-500">
                {birthdaysThisMonthCount} cumpleañeros este mes
              </span>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <span className="text-xs text-zinc-500 block">
              Cafés del Día Reclamados Hoy
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {claimedTodayMembers.length}
              </span>
              <span className="text-xs text-zinc-500 font-mono tabular-nums">
                {Math.max(0, activeMembers.length - claimedTodayMembers.length)}{' '}
                disponibles hoy
              </span>
            </div>
          </div>

          <div
            onClick={() => setActiveTab('inactive')}
            className="bg-white border border-zinc-200 hover:border-amber-400 rounded-xl p-5 transition-colors cursor-pointer"
          >
            <span className="text-xs text-amber-800 font-medium block">
              Sin Reclamar (+5 Días) · Enviar Recordatorio
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono tabular-nums text-amber-700">
                {inactiveFiveDaysMembers.length}
              </span>
              <span className="text-xs text-amber-800 underline">
                Ver socios para contactar
              </span>
            </div>
          </div>

          <div
            onClick={() => setActiveTab('staff')}
            className="bg-white border border-zinc-200 hover:border-zinc-400 rounded-xl p-5 transition-colors cursor-pointer"
          >
            <span className="text-xs text-zinc-500 block">
              Equipo Autorizado y Total Bonos
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono tabular-nums text-zinc-900">
                {totalHistoricalClaims}
              </span>
              <span className="text-xs text-zinc-600 underline">
                {staffInvites.filter((s) => s.status === 'active').length + 1}{' '}
                correos con acceso
              </span>
            </div>
          </div>
        </section>

        {activeTab === 'staff' && (
          <StaffManagerPanel
            isAdmin={isAdmin}
            staffInvites={staffInvites}
            onAddStaff={handleAddStaff}
            onToggleStaffStatus={handleToggleStaffStatus}
            onDeleteStaffInvite={handleDeleteStaffInvite}
          />
        )}

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-zinc-200">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">
                    Estación Rápida · Reclamo de Café del Día
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Busca por ID Único (<span className="font-mono">KAF-XXXX</span>),
                    nombre o teléfono para validar y registrar el bono diario.
                  </p>
                </div>
                <span className="text-xs font-mono text-zinc-500 shrink-0">
                  Límite: 1 / día
                </span>
              </div>

              <div className="mt-4 relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={quickLookupQuery}
                  onChange={(e) => setQuickLookupQuery(e.target.value)}
                  placeholder="Ingresa ID del miembro (ej. KAF-2041), nombre o teléfono..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-zinc-50 border border-zinc-300 rounded-lg text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-none"
                />
              </div>

              <div className="mt-4 divide-y divide-zinc-100">
                {dataLoading ? (
                  <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                    Sincronizando base de datos compartida...
                  </div>
                ) : activeMembers.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm font-medium text-zinc-800">
                      Aún no hay miembros en la base de datos
                    </p>
                    <p className="text-xs text-zinc-500 mt-1 mb-4">
                      Registra al primer miembro desde tu teléfono o carga datos de
                      ejemplo.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMember(null);
                          setIsRegisterModalOpen(true);
                        }}
                        className="px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                      >
                        Registrar Primer Miembro
                      </button>
                      <button
                        type="button"
                        disabled={seedingDemo}
                        onClick={handleSeedDemoData}
                        className="px-4 py-2 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
                      >
                        {seedingDemo ? 'Cargando...' : 'Cargar Datos de Ejemplo'}
                      </button>
                    </div>
                  </div>
                ) : quickLookupResults.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    No se encontró ningún miembro con "{quickLookupQuery}".
                  </div>
                ) : (
                  quickLookupResults.map((member) => {
                    const claimed = hasClaimedToday(member, todayStr);
                    const daysWithout = getDaysWithoutClaim(member, todayStr);
                    const isClaiming = claimingMemberId === member.id;

                    return (
                      <div
                        key={member.id}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setCardModalMember(member)}
                              className="font-mono text-xs font-semibold text-zinc-900 hover:underline cursor-pointer"
                            >
                              {member.memberCode}
                            </button>
                            <span aria-hidden="true" className="text-zinc-300">
                              ·
                            </span>
                            <span className="text-sm font-semibold text-zinc-900 truncate">
                              {member.name}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500 mt-0.5 font-mono tabular-nums">
                            <span>{member.phone}</span>
                            <span aria-hidden="true">·</span>
                            <span>{member.totalClaims} cafés reclamados</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                daysWithout >= 5 ? 'text-amber-700 font-medium' : ''
                              }
                            >
                              {claimed
                                ? 'Reclamado hoy'
                                : member.lastClaimDate
                                ? `Hace ${daysWithout}d (${member.lastClaimDate})`
                                : 'Sin reclamos previos'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setCardModalMember(member)}
                            className="px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            title="Ver Credencial Digital"
                          >
                            Credencial
                          </button>
                          <button
                            type="button"
                            disabled={claimed || isClaiming}
                            onClick={() => handleClaimDailyCoffee(member)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                              claimed
                                ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                                : 'bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer'
                            }`}
                          >
                            {claimed ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Ya Reclamó Hoy</span>
                              </>
                            ) : (
                              <>
                                <Coffee className="w-3.5 h-3.5" />
                                <span>
                                  {isClaiming ? 'Registrando...' : 'Entregar Café Hoy'}
                                </span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6">
              <div className="flex items-center justify-between gap-2 pb-4 border-b border-zinc-200">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">
                    Alertas de Retención · +5 Días sin Reclamar
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Miembros que llevan 5 o más días sin reclamar su café del día.
                  </p>
                </div>
                <Bell className="w-4 h-4 text-amber-700 shrink-0" />
              </div>

              <div className="mt-4 divide-y divide-zinc-100">
                {inactiveFiveDaysMembers.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm font-medium text-zinc-800">
                      Todos tus miembros están al día
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Ningún socio activo supera el lapso de 5 días sin reclamar su
                      café.
                    </p>
                  </div>
                ) : (
                  inactiveFiveDaysMembers.slice(0, 6).map((member) => {
                    const daysWithout = getDaysWithoutClaim(member, todayStr);
                    const remindedToday = member.lastReminderSentDate === todayStr;

                    return (
                      <div key={member.id} className="py-3.5 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-zinc-900">
                                {member.name}
                              </span>
                              <span aria-hidden="true" className="text-zinc-300">
                                ·
                              </span>
                              <span className="font-mono text-xs text-zinc-600">
                                {member.memberCode}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-500 font-mono tabular-nums mt-0.5">
                              Tel: {member.phone} · Último:{' '}
                              {member.lastClaimDate || 'Sin reclamos'}
                            </div>
                          </div>

                          <span className="text-xs font-mono tabular-nums font-semibold text-amber-800 shrink-0">
                            {daysWithout} días inactivo
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-zinc-500">
                            {remindedToday
                              ? 'Recordatorio enviado hoy'
                              : member.lastReminderSentDate
                              ? `Último aviso: ${member.lastReminderSentDate}`
                              : 'Pendiente de enviar recordatorio'}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setReminderModalMember(member)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>
                                {remindedToday
                                  ? 'Reenviar Mensaje'
                                  : 'Enviar Recordatorio'}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {inactiveFiveDaysMembers.length > 6 && (
                <div className="mt-4 pt-3 border-t border-zinc-100 text-right">
                  <button
                    type="button"
                    onClick={() => setActiveTab('inactive')}
                    className="text-xs font-medium text-zinc-900 hover:underline cursor-pointer"
                  >
                    Ver los {inactiveFiveDaysMembers.length} miembros inactivos →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {(activeTab === 'directory' || activeTab === 'overview') && (
          <section className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  Base de Datos Compartida de Membresías
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Todos los empleados autorizados ven y actualizan esta misma base de
                  datos en tiempo real desde sus teléfonos.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-lg overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setDirectoryFilter('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      directoryFilter === 'all'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Todos ({activeMembers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectoryFilter('available_today')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      directoryFilter === 'available_today'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Disponibles Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectoryFilter('claimed_today')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      directoryFilter === 'claimed_today'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Reclamaron Hoy ({claimedTodayMembers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectoryFilter('inactive_5d')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      directoryFilter === 'inactive_5d'
                        ? 'bg-white text-amber-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Inactivos +5d ({inactiveFiveDaysMembers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectoryFilter('birthdays')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      directoryFilter === 'birthdays'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Cumpleaños Mes ({birthdaysThisMonthCount})
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrar nombre, ID o tel..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-300 rounded-lg text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-none w-full sm:w-52"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-semibold text-zinc-500">
                    <th className="py-3 px-4">ID Único</th>
                    <th className="py-3 px-4">Nombre del Miembro</th>
                    <th className="py-3 px-4">Cumpleaños</th>
                    <th className="py-3 px-4">Teléfono</th>
                    <th className="py-3 px-4 text-right">Total Reclamos</th>
                    <th className="py-3 px-4">Último Reclamo / Lapso</th>
                    <th className="py-3 px-4">Estado Hoy</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-xs">
                  {filteredDirectoryMembers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-zinc-500">
                        No hay miembros que coincidan con el filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    filteredDirectoryMembers.map((member) => {
                      const claimed = hasClaimedToday(member, todayStr);
                      const daysWithout = getDaysWithoutClaim(member, todayStr);
                      const inactive5d = daysWithout >= 5;
                      const bday = isBirthdayTodayOrMonth(
                        member.birthDate,
                        todayStr
                      );
                      const isClaiming = claimingMemberId === member.id;

                      return (
                        <tr
                          key={member.id}
                          className="hover:bg-zinc-50/80 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono tabular-nums font-semibold text-zinc-900 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setCardModalMember(member)}
                              className="hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                              title="Abrir credencial digital"
                            >
                              <CreditCard className="w-3.5 h-3.5 text-zinc-400" />
                              <span>{member.memberCode}</span>
                            </button>
                          </td>
                          <td className="py-3 px-4 font-medium text-zinc-900 whitespace-nowrap">
                            {member.name}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-zinc-600 whitespace-nowrap">
                            <span>{member.birthDate}</span>
                            {bday.isToday && (
                              <span className="ml-1.5 text-amber-800 font-sans font-medium">
                                · Hoy
                              </span>
                            )}
                            {!bday.isToday && bday.isThisMonth && (
                              <span className="ml-1.5 text-zinc-500 font-sans">
                                · ({bday.formattedBirthday})
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-zinc-700 whitespace-nowrap">
                            {member.phone}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums font-semibold text-zinc-900 text-right whitespace-nowrap">
                            {member.totalClaims}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                            {member.lastClaimDate ? (
                              <span
                                className={
                                  inactive5d
                                    ? 'text-amber-800 font-medium'
                                    : 'text-zinc-600'
                                }
                              >
                                {member.lastClaimDate} · hace {daysWithout}d
                              </span>
                            ) : (
                              <span
                                className={
                                  inactive5d
                                    ? 'text-amber-800 font-medium'
                                    : 'text-zinc-400'
                                }
                              >
                                Sin reclamos · {daysWithout}d
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {claimed ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Reclamado hoy</span>
                              </span>
                            ) : inactive5d ? (
                              <span className="inline-flex items-center gap-1 text-amber-800 font-medium">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Inactivo +5 días</span>
                              </span>
                            ) : (
                              <span className="text-zinc-600">Disponible hoy</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={claimed || isClaiming}
                                onClick={() => handleClaimDailyCoffee(member)}
                                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                                  claimed
                                    ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                                    : 'bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer'
                                }`}
                              >
                                {claimed
                                  ? '1/1 Hoy'
                                  : isClaiming
                                  ? '...'
                                  : 'Reclamar Café'}
                              </button>

                              {inactive5d && (
                                <button
                                  type="button"
                                  onClick={() => setReminderModalMember(member)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                  title="Enviar recordatorio por más de 5 días sin reclamar"
                                >
                                  Recordar
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMember(member);
                                  setIsRegisterModalOpen(true);
                                }}
                                className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition-colors cursor-pointer"
                                title="Editar datos del miembro"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {isAdmin && (
                                <>
                                  {confirmDeleteId === member.id ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteMember(member)}
                                        className="px-2 py-1 text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                                      >
                                        Confirmar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100 rounded cursor-pointer"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(member.id)}
                                      className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                      title="Eliminar miembro"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'inactive' && (
          <section className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  Seguimiento de Inactividad · Miembros con +5 Días sin Reclamar su Café
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Lista automática para que tus empleados envíen un recordatorio por
                  WhatsApp o SMS desde sus teléfonos.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-amber-800 font-semibold shrink-0">
                {inactiveFiveDaysMembers.length} miembros detectados
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-semibold text-zinc-500">
                    <th className="py-3 px-4">ID Único</th>
                    <th className="py-3 px-4">Miembro</th>
                    <th className="py-3 px-4">Teléfono para Mensaje</th>
                    <th className="py-3 px-4">Último Reclamo</th>
                    <th className="py-3 px-4 text-right">Días sin Reclamar</th>
                    <th className="py-3 px-4">Estado de Recordatorio</th>
                    <th className="py-3 px-4 text-right">Acciones del Empleado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-xs">
                  {inactiveFiveDaysMembers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-500">
                        Excelente: ningún miembro supera los 5 días sin reclamar su café
                        del día.
                      </td>
                    </tr>
                  ) : (
                    inactiveFiveDaysMembers.map((member) => {
                      const days = getDaysWithoutClaim(member, todayStr);
                      const remindedToday = member.lastReminderSentDate === todayStr;

                      return (
                        <tr
                          key={member.id}
                          className="hover:bg-zinc-50/80 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-mono tabular-nums font-semibold text-zinc-900 whitespace-nowrap">
                            {member.memberCode}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-zinc-900 whitespace-nowrap">
                            {member.name}
                          </td>
                          <td className="py-3.5 px-4 font-mono tabular-nums text-zinc-800 whitespace-nowrap">
                            {member.phone}
                          </td>
                          <td className="py-3.5 px-4 font-mono tabular-nums text-zinc-600 whitespace-nowrap">
                            {member.lastClaimDate || 'Nunca ha reclamado'}
                          </td>
                          <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-amber-800 text-right whitespace-nowrap">
                            {days} días
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {remindedToday ? (
                              <span className="text-emerald-700 font-medium">
                                Recordatorio enviado hoy ({todayStr})
                              </span>
                            ) : member.lastReminderSentDate ? (
                              <span className="text-zinc-600 font-mono tabular-nums">
                                Último aviso: {member.lastReminderSentDate}
                              </span>
                            ) : (
                              <span className="text-amber-800 font-medium">
                                Pendiente de contactar
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setReminderModalMember(member)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Preparar Mensaje</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleClaimDailyCoffee(member)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Coffee className="w-3.5 h-3.5" />
                                <span>Reclamar Café Hoy</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'history' && (
          <section className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  Bitácora Compartida de Reclamos del Café del Día
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Registro inmutable de cada café entregado por tu equipo.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-zinc-600 shrink-0">
                {claims.length} registros en bitácora
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-semibold text-zinc-500">
                    <th className="py-3 px-4">Fecha del Reclamo</th>
                    <th className="py-3 px-4">ID del Miembro</th>
                    <th className="py-3 px-4">Nombre del Miembro</th>
                    <th className="py-3 px-4">Café del Día Entregado</th>
                    <th className="py-3 px-4">Entregado Por</th>
                    <th className="py-3 px-4 text-right">Folio Único</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-xs">
                  {claims.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-500">
                        Aún no se han registrado reclamos de café en la bitácora.
                      </td>
                    </tr>
                  ) : (
                    claims.map((claim) => (
                      <tr
                        key={claim.id}
                        className="hover:bg-zinc-50/80 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono tabular-nums font-medium text-zinc-900 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{claim.claimDate}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums font-semibold text-zinc-900 whitespace-nowrap">
                          {claim.memberCode}
                        </td>
                        <td className="py-3 px-4 font-medium text-zinc-900 whitespace-nowrap">
                          {claim.memberName}
                        </td>
                        <td className="py-3 px-4 text-zinc-700 whitespace-nowrap">
                          {claim.coffeeType}
                        </td>
                        <td className="py-3 px-4 text-zinc-600 whitespace-nowrap">
                          {claim.servedBy}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-zinc-400 text-right whitespace-nowrap">
                          {claim.id}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <footer className="px-6 lg:px-10 py-5 border-t border-zinc-200 bg-white text-xs text-zinc-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span>
          KaffeClub · Enlace para empleados: {SHARED_APP_URL}
        </span>
        <span className="font-mono tabular-nums">
          Acceso exclusivo por correo autorizado · 1 reclamo / día
        </span>
      </footer>

      <RegisterMemberModal
        isOpen={isRegisterModalOpen}
        editingMember={editingMember}
        existingCodes={existingCodes}
        onClose={() => {
          setIsRegisterModalOpen(false);
          setEditingMember(null);
        }}
        onSaveMember={handleSaveMember}
      />

      <MemberCardModal
        member={cardModalMember}
        todayStr={todayStr}
        onClose={() => setCardModalMember(null)}
        onClaimToday={handleClaimDailyCoffee}
        onOpenReminder={(m) => setReminderModalMember(m)}
      />

      <ReminderModal
        member={reminderModalMember}
        todayStr={todayStr}
        onClose={() => setReminderModalMember(null)}
        onMarkReminderSent={handleMarkReminderSent}
      />
    </div>
  );
}
