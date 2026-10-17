import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { readProfile, updateProfile } from "../utils/userProfile";
import { getOnboardingState } from "../onboarding/onboardingState";

export const UserProfileContext = createContext(null);

export function UserProfileProvider({ children, storage }) {
  const [result, setResult] = useState({ status: "loading", profile: null });
  const [saveError, setSaveError] = useState(null);
  // Fixé à la première lecture exploitable ; ni sauvegarde ni relecture ne
  // transforme un parcours commencé pendant cette utilisation en reprise.
  const resumedOnLoad = useRef(null);

  const reloadProfile = useCallback(() => {
    const loaded = readProfile(storage);
    if (resumedOnLoad.current === null && (loaded.status === "absent" || loaded.status === "valid")) {
      resumedOnLoad.current = getOnboardingState(loaded).isResuming === true;
    }
    setResult(loaded);
    setSaveError(null);
  }, [storage]);

  useEffect(() => { reloadProfile(); }, [reloadProfile]);

  const updateUserProfile = useCallback((changes) => {
    const saved = updateProfile(changes, storage);
    if (saved.status === "saved") {
      setResult({ status: "valid", profile: saved.profile });
      setSaveError(null);
    } else {
      // Une saisie invalide ne remplace pas le profil par un brouillon.
      // Si le stockage est devenu illisible, le garde d'accès le reflète aussi.
      setResult(readProfile(storage));
      setSaveError(saved.status);
    }
    return saved;
  }, [storage]);

  return <UserProfileContext.Provider value={{
    profile: result.profile,
    profileStatus: result.status,
    onboarding: getOnboardingState(result, resumedOnLoad.current === true),
    saveError,
    reloadProfile,
    updateUserProfile,
  }}>{children}</UserProfileContext.Provider>;
}

export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (!context) throw new Error("useUserProfile doit être utilisé dans UserProfileProvider.");
  return context;
}
