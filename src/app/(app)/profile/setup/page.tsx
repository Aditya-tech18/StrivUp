"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Flame, Check, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card } from "@/components/ui";
import {
  getMyProfile,
  upsertMyProfile,
  getAllInterests,
  getMyInterestIds,
  setMyInterests,
  uploadMyAvatar,
  sendPhoneOtp,
  verifyPhoneOtp,
  resendEmailVerification,
  isProfileComplete,
  PROFILE_CONSTANTS,
  type Interest,
} from "@/lib/supabase/profile";

export default function ProfileSetupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);

  const [allInterests, setAllInterests] = useState<Interest[]>([]);
  const [selectedInterestIds, setSelectedInterestIds] = useState<number[]>([]);
  const [interestsModalOpen, setInterestsModalOpen] = useState(false);
  const [draftInterestIds, setDraftInterestIds] = useState<number[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }

        const [profile, interests, myInterestIds] = await Promise.all([
          getMyProfile(),
          getAllInterests(),
          getMyInterestIds(),
        ]);

        setFullName(profile?.full_name ?? user.user_metadata?.full_name ?? "");
        setAge(profile?.age ? String(profile.age) : "");
        setEmail(user.email ?? "");
        setEmailVerified(Boolean(user.email_confirmed_at));
        setAvatarUrl(profile?.avatar_url ?? null);
        setPhone(profile?.phone ?? "");
        setPhoneVerified(profile?.phone_verified ?? false);
        setAllInterests(interests);
        setSelectedInterestIds(myInterestIds);

        if (
          profile?.profile_completed &&
          isProfileComplete(profile, Boolean(user.email_confirmed_at), myInterestIds.length)
        ) {
          router.replace("/feed");
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const canComplete =
    fullName.trim().length > 0 &&
    Number(age) >= 13 &&
    Number(age) <= 120 &&
    emailVerified &&
    phoneVerified &&
    selectedInterestIds.length >= PROFILE_CONSTANTS.MIN_INTERESTS;

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadMyAvatar(file);
      setAvatarUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo");
    }
  }

  async function handleResendVerification() {
    try {
      await resendEmailVerification(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend email");
    }
  }

  async function handleSendOtp() {
    setError(null);
    setOtpBusy(true);
    try {
      await sendPhoneOtp(phone);
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setOtpBusy(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    setOtpBusy(true);
    try {
      await verifyPhoneOtp(phone, otp);
      setPhoneVerified(true);
      setOtpSent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code");
    } finally {
      setOtpBusy(false);
    }
  }

  function openInterestsModal() {
    setDraftInterestIds(selectedInterestIds);
    setInterestsModalOpen(true);
  }

  function toggleDraftInterest(id: number) {
    setDraftInterestIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSaveInterests() {
    try {
      await setMyInterests(draftInterestIds);
      setSelectedInterestIds(draftInterestIds);
      setInterestsModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save interests");
    }
  }

  async function handleComplete() {
    if (!canComplete) return;
    setSaving(true);
    setError(null);
    try {
      await upsertMyProfile({
        full_name: fullName.trim(),
        age: Number(age),
        email,
        phone,
        phone_verified: true,
        profile_completed: true,
      });
      router.replace("/feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="type-body-md text-on-surface-variant">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface px-5 py-8">
      <div className="mx-auto max-w-md flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center">
            <Flame size={24} className="text-on-primary" aria-hidden="true" />
          </div>
          <h1 className="type-title-lg text-on-surface">Complete Your Profile</h1>
          <p className="type-body-md text-on-surface-variant">
            Set up your profile so STRIV can personalize your experience.
          </p>
        </div>

        {error && (
          <p className="type-body-md text-error text-center" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col items-center gap-2">
          <label className="relative cursor-pointer group">
            <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center overflow-hidden border border-outline-variant">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <Camera size={24} className="text-on-surface-variant" aria-hidden="true" />
              )}
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handleAvatarChange}
            />
          </label>
          <p className="type-body-md text-on-surface-variant">
            Add a profile photo <span className="text-on-surface-variant/70">(Optional)</span>
          </p>
        </div>

        <Card bordered padding="lg" className="flex flex-col gap-4">
          <p className="type-label-caps text-on-surface-variant">Basic Information</p>

          <Input
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
            maxLength={80}
            required
          />

          <Input
            label="Age"
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Your age"
            min={13}
            max={120}
            required
          />

          <div className="flex flex-col gap-1">
            <label className="type-body-md font-medium text-on-surface">Email</label>
            <div className="flex items-center justify-between rounded border border-outline-variant bg-surface-container-low h-10 px-3">
              <span className="type-body-lg text-on-surface truncate">{email}</span>
              {emailVerified ? (
                <span className="flex items-center gap-1 type-label-caps text-tertiary-fixed shrink-0">
                  <Check size={14} /> Verified
                </span>
              ) : (
                <span className="type-label-caps text-error shrink-0">Not verified</span>
              )}
            </div>
            {!emailVerified && (
              <div className="flex items-center justify-between">
                <p className="type-body-md text-error">Verify your email to continue</p>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  className="type-body-md text-secondary font-medium"
                >
                  Resend email
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="type-body-md font-medium text-on-surface">Mobile Number</label>
            <div className="flex gap-2">
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                disabled={phoneVerified}
                className="flex-1"
              />
              {!phoneVerified && (
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={handleSendOtp}
                  disabled={otpBusy || phone.trim().length < 8}
                >
                  {otpSent ? "Resend OTP" : "Send OTP"}
                </Button>
              )}
            </div>
            {phoneVerified && (
              <span className="flex items-center gap-1 type-label-caps text-tertiary-fixed">
                <Check size={14} /> Verified
              </span>
            )}
            {otpSent && !phoneVerified && (
              <div className="flex gap-2 mt-1">
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit OTP"
                  maxLength={6}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleVerifyOtp}
                  disabled={otpBusy || otp.length < 4}
                >
                  Verify
                </Button>
              </div>
            )}
          </div>
        </Card>

        <Card bordered padding="lg" className="flex flex-col gap-2">
          <p className="type-label-caps text-on-surface-variant">Interests</p>
          <div className="flex items-center justify-between">
            <p className="type-body-lg text-on-surface">
              {selectedInterestIds.length} selected
            </p>
            <Button type="button" variant="outline" size="sm" onClick={openInterestsModal}>
              Edit Interests
            </Button>
          </div>
          {selectedInterestIds.length < PROFILE_CONSTANTS.MIN_INTERESTS && (
            <p className="type-body-md text-error">
              Select at least {PROFILE_CONSTANTS.MIN_INTERESTS} interests
            </p>
          )}
        </Card>

        <Button
          type="button"
          variant="primary"
          fullWidth
          size="lg"
          disabled={!canComplete || saving}
          onClick={handleComplete}
        >
          {saving ? "Saving…" : "Complete Profile"}
        </Button>
      </div>

      {interestsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-t-xl sm:rounded-xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="type-headline-sm text-on-surface">Choose your interests</h2>
              <button
                type="button"
                onClick={() => setInterestsModalOpen(false)}
                aria-label="Close"
                className="text-on-surface-variant"
              >
                <X size={20} />
              </button>
            </div>
            <p className="type-body-md text-on-surface-variant mb-4">
              Select at least {PROFILE_CONSTANTS.MIN_INTERESTS} interests —{" "}
              {draftInterestIds.length} / {allInterests.length} selected
            </p>

            <div className="flex flex-wrap gap-2 mb-6">
              {allInterests.map((interest) => {
                const selected = draftInterestIds.includes(interest.id);
                return (
                  <button
                    key={interest.id}
                    type="button"
                    onClick={() => toggleDraftInterest(interest.id)}
                    className={[
                      "px-4 py-2 rounded-full type-body-md border transition-colors duration-150",
                      selected
                        ? "bg-secondary text-on-secondary border-secondary"
                        : "bg-surface-container text-on-surface-variant border-outline-variant hover:border-outline",
                    ].join(" ")}
                  >
                    {interest.name}
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              variant="primary"
              fullWidth
              disabled={draftInterestIds.length < PROFILE_CONSTANTS.MIN_INTERESTS}
              onClick={handleSaveInterests}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
