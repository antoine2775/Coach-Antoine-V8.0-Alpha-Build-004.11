import React, { useState } from "react";
import { useUserProfile } from "../context/UserProfileContext";
import { LEVEL_OPTIONS, EQUIPMENT_OPTIONS, ADDRESS_OPTIONS, PROFILE_SETTINGS_MESSAGES,
  prepareProfileSetting, toggleProfileEquipment } from "../utils/profileSettings";

export default function ProfileSettings() {
  const { profile, updateUserProfile, saveError } = useUserProfile();
  const [error, setError] = useState(false);
  if (!profile?.onboardingCompleted) return null;
  const messages = PROFILE_SETTINGS_MESSAGES[profile.addressMode === "vous" ? "vous" : "tu"];
  const save = (field, value) => {
    const changes = prepareProfileSetting(profile, field, value);
    if (!changes) { setError(true); return; }
    const result = updateUserProfile(changes);
    setError(result.status !== "saved");
  };
  return <>
    <section aria-labelledby="profile-level-title">
      <h3 id="profile-level-title">Mon niveau</h3>
      <p>{messages.level}</p>
      <div role="radiogroup" aria-labelledby="profile-level-title">
        {LEVEL_OPTIONS.map((option) => <label className="toggle-row" key={option.value}>
          <span>{option.label}</span>
          <input type="radio" name="profile-level" value={option.value}
            checked={profile.selectedLevel === option.value} onChange={() => save("selectedLevel", option.value)} />
        </label>)}
      </div>
    </section>
    <section aria-labelledby="profile-equipment-title">
      <h3 id="profile-equipment-title">Mon matériel</h3>
      <p>{messages.equipment}</p>
      <div role="group" aria-labelledby="profile-equipment-title">
        <label className="toggle-row">
          <span>Aucun matériel</span>
          <input type="checkbox" checked={profile.equipment.length === 0} onChange={() => save("equipment", [])} />
        </label>
        {EQUIPMENT_OPTIONS.map((option) => <label className="toggle-row" key={option.value}>
          <span>{option.label}</span>
          <input type="checkbox" checked={profile.equipment.includes(option.value)}
            onChange={(event) => save("equipment", toggleProfileEquipment(profile.equipment, option.value, event.target.checked))} />
        </label>)}
      </div>
    </section>
    <section aria-labelledby="profile-address-title">
      <h3 id="profile-address-title">Comment Coach Antoine me parle</h3>
      <div role="radiogroup" aria-labelledby="profile-address-title">
        {ADDRESS_OPTIONS.map((option) => <label className="toggle-row" key={option.value}>
          <span>{option.label}</span>
          <input type="radio" name="profile-address" value={option.value}
            checked={profile.addressMode === option.value} onChange={() => save("addressMode", option.value)} />
        </label>)}
      </div>
    </section>
    {(error || saveError) && <p role="alert">{messages.error}</p>}
  </>;
}
