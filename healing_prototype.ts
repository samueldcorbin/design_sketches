// Assumption: Players have a health bar and can be afflicted with various status effects. Info frames with health bars, icons for status effects, etc. are displayed for the player, their target, party members, etc.
//
// Goals: Support roles attract more casual players, so there should be the option for accessible play that is slower and less complex. There should also be optional depth, and players should be able to dynamically decide how much depth to take on from moment to moment. A "full" healer should be possible, but it should also be possible for a healer to mix in offense when healing is not necessary, and these two options should not be too disimilar in DPS contribution to a party. Total throughput should always incentivize combining groups, never splitting. Implementation should be easy to tune and extensible - easy to add more status effects and even more colors.
//
// UI: A red health bar, and status icons tinted green or blue. The player has 4 buttons - Red, Green, Blue, Tri-color. Players press the button, then click anywhere on their screen.
//
// Functionality:
//
// Using any of the buttons begins a shared cooldown that locks the player out of all of them.
//
// All heals have "smart" targeting:
// The Tri-color Heal is an extra-"smart" universal heal. It has a base cooldown and behaves differently if the player clicks:
//     A status effect icon: It will cure that status effect (no cooldown penalty)
//     A target or unit frame: It will cure a random status effect, or heal if there are no status effects (small cooldown penalty).
//     Anywhere else: It will apply the same logic as the targeted heal to everyone in the party, with a reduced heal (large cooldown penalty).
//
// Once the player has the Red Heal skill (matching a conventional red health bar), this allows them to heal health directly, without having to heal status effects first:
//     Lower base cooldown than Tri-color Heal
//     Same output as Tri-color Heal, but skips checking for/healing status effects
// 
// Green and Blue Heals are primarily for healing status effects.
//     Lower base cooldown than Tri-color Heal.
//     Status effects come in color-coded Green and Blue varieties (indicated by tinting the icon in the UI).
//     If a player clicks:
//        A status effect icon: It will only cure it if the heal and status effect color match. Otherwise, the heal fails and a very brief cooldown is imposed.
//        A target or unit frame: It will cure one status effect of the associated color. If there is no such status effect, the heal fails and a brief cooldown is imposed instead.
//        Anywhere else: It will cure one status effect of the associated color on every party member. If no member of the party has a single status effect of this color, the heal fails and a brief cooldown is imposed instead.
//
// Overhealing a target beyond their maximum health increases their damage output (it does NOT act as additional temporary HP). The overheal decays over time (probably nonlinearly).
//
// 
//
// Notes:
// Thus new, casual, or overwhelmed players can simply use the Tri-color Heal. This will always have an effect. A more skilled player can decide to used specific-color heals, gaining more control over what is healed to prioritize the most important status effects or health damage and gaining a faster cooldown. Players can mix-and-match these heals moment-to-moment: a new player might stick to Tri-color heals, but decide to mix in a Red Heal when it seems useful and they're not feeling as overwhelmed. An experienced player who is feeling overwhelmed at a particular moment might drop to using Tri-color heal a couple of times, or might simply decide to use it when the stakes are low and they don't want to devote their full attention. Because the more specific heals reward players with shorter cooldowns, more skilled players are also given a faster pace of gameplay.
//
// Because the cooldowns are shared, a player who relies only on Tri-color heals does not have the same catastrophic throughput loss as if they were only using 1 of 4 available healing cooldowns. The difference in the output between skilled and unskilled players can be tuned by adjusting the cooldown length of Tri-color heals and individual color heals.
//
// A skilled player would never use a Tri-color heal targeted at an individual or a particular status effect, but might use an untargeted (i.e., group) Tri-color heal - it isn't a dead button for skilled healers.
//
// The most skilled players have complex decisions to make, balancing targeted and untargeted heals, which color status effects to heal, health or status effects (or both via untargeted Tri-color), etc.
//
// It is never ideal for a skilled player to heal status effects by targeting an individual rather than a specific status effect, but players who struggle at the aiming challenge of quickly selecting specific status effects can target individual entities instead for a minor cooldown penalty.
//
// Finally, players who choose to play as dedicated healers can still contribute to party DPS even when healing pressure is low by overhealing party members. Players can decide for themselves whether to mix in offensive abilities when healing pressure is low (increasing DPS directly) or continue to focus on healing to increase party DPS by buffing teammates via overhealing. Full healers never become dead weight in environments where healing pressure is low or spiky.

//
// Note: A full implementation would allow the player to click on the in-world targets just like clicking on their associated info frames. The background image here is just a static mockup and doesn't implement this functionality.
// Click a heal button and then click what you want to heal: a status effect, a unit's row, or anywhere else on the screen
// Click Edit Mode to enable changing health and team, and enable toggling status effects
//

// Tuning constants
const base_heal_percent = 30; // Base percent of max health a targeted heal should restore
const heal_percent_reduction_per_target = 5; // Multiplicative penalty to healing amount per target for untargeted (i.e., party) heals
const overheal_reduction_interval = 1000; // how often to reduce overheal in ms
const overheal_reduction = (overheal: number) => {return overheal / 2}; // How to reduce overheal each interval
// Red Heals
const red_heal_target_multiplier = 1; // healing to base_heal_percent when targeting specific entity
const red_heal_target_cooldown = 500; // cooldown in ms
const red_heal_party_multiplier = 1; // multiplier to base_heal_percent when untargeted (i.e., healing party)
const red_heal_party_cooldown = 1000;
// Tri-color Heals
const tri_color_heal_status_effect_cooldown = 500; // When targeting a specific status effect icon
const tri_color_heal_target_multiplier = 1;
const tri_color_heal_target_cooldown = 1000; // When targeting a specific entity
const tri_color_heal_party_multiplier = 1;
const tri_color_heal_party_cooldown = 1500; // When untargeted (i.e., healing party)
// Green, blue, etc. (not Red/Tri-color) heals - for healing status effects
const other_color_heal_status_effect_cooldown = 250;
const other_color_heal_target_cooldown = 500;
const other_color_heal_party_cooldown = 1000;
const wrong_color_status_effect_cooldown = 250; // Cooldown triggered whenever attempting to heal a status effect of one color with a different colored heal



// Add status effects here
const enum StatusEffect {
    Stasis,
    Asleep,
    Burning,
    Poisoned,
    Frozen
}
const number_of_status_effects = 5; // This is an ugly hack. Is there a better way to do this?
const status_effect_to_string = new Map([
    [StatusEffect.Stasis, "Stasis"],
    [StatusEffect.Asleep, "Asleep"],
    [StatusEffect.Burning, "Burning"],
    [StatusEffect.Poisoned, "Poisoned"],
    [StatusEffect.Frozen, "Frozen"]
]);
const status_effect_get_color_map = new Map([
    [StatusEffect.Stasis, StatusEffectColor.Black],
    [StatusEffect.Asleep, StatusEffectColor.Blue],
    [StatusEffect.Burning, StatusEffectColor.Green],
    [StatusEffect.Poisoned, StatusEffectColor.Green],
    [StatusEffect.Frozen, StatusEffectColor.Blue]
]);



// Add status effect colors here
const enum StatusEffectColor {
    Black,
    Blue,
    Green
}
const status_effect_color_to_string = new Map([
    [StatusEffectColor.Black, "black"],
    [StatusEffectColor.Blue, "blue"],
    [StatusEffectColor.Green, "green"]
]);



// Add colors here to give players skills to heal them
enum HealButtonColor {
    Tricolor, // Leave this first since it needs special theming
    Red,
    Green,
    Blue
}
const number_of_heal_button_colors = 4; // This is an ugly hack. Is there a better way to do this?
const heal_button_color_to_string = new Map([
    [HealButtonColor.Tricolor, "Tri-color"],
    [HealButtonColor.Red, "Red"],
    [HealButtonColor.Green, "Green"],
    [HealButtonColor.Blue, "Blue"]
]);
const heal_button_color_to_css_color = new Map([
    [HealButtonColor.Tricolor, "linear-gradient(to right, red, green, blue)"],
    [HealButtonColor.Red, "red"],
    [HealButtonColor.Green, "green"],
    [HealButtonColor.Blue, "blue"]
]);
const heal_button_heals_status_effect_color_map = new Map([
    [HealButtonColor.Green, StatusEffectColor.Green],
    [HealButtonColor.Blue, StatusEffectColor.Blue],
]);



// General helper functions
function random_array_element(array: any[]): any { // Incompatible with sparse arrays
    const i = Math.floor(Math.random() * array.length);
    return array[i];
}
function set_to_array(my_set: Set<any>) {
    return Array.from(my_set);

}
function heal_button_heals_status_effect_color(heal_button_color: HealButtonColor) {
    const heal_color = heal_button_heals_status_effect_color_map.get(heal_button_color);
    if (heal_color === undefined) {
        throw new Error("Heal button color has no mapping to status effect color");
    }
    return heal_color as StatusEffectColor;
}
function status_effect_get_color(status_effect: StatusEffect) {
    const color = status_effect_get_color_map.get(status_effect);
    if (color === undefined) {
        throw new Error("Status effect has no associated color");
    }
    return color as StatusEffectColor;
}



// Implements a generic, targetable game object with some basic stats
class Entity {
    party: Entity[] = [this];
    private _overheal = 0;
    _status_effects: Set<StatusEffect>[] = []; // TODO: Figure out why this can't be protected

    // Some hacky front end stuff
    tr = document.createElement("tr");
    name_td = document.createElement("td");
    health_td = document.createElement("td");
    max_health_td = document.createElement("td");
    overheal_td = document.createElement("td");
    team_td = document.createElement("td");
    status_effect_tds: HTMLTableCellElement[] = [];

    constructor(public name: string, private _health: number, private _max_health: number, public team: string) {
        // Ideally do one timer that sweeps across every overhealed entity, but this is fine for now
        setInterval(() => {
            this.overheal = Math.floor(overheal_reduction(this.overheal));
        }, overheal_reduction_interval);
    }
    
    get max_health() {
        return this._max_health;
    }
    set max_health(new_health) {
        if (new_health < 0 ) {
            throw new Error("Max health can't be negative");
        }
        if (this._health > new_health) {
            throw new Error("New max health " + new_health.toString() + " is less than current health " + this._health.toString());
        }
        this._max_health = new_health;
        this.max_health_td.textContent = new_health.toString();
    }

    get health() {
        return this._health;
    }
    set health(new_health) {
        if (new_health < 0) {
            throw new Error("Health can't be negative");
        }
        if (new_health > this._max_health) {
            throw new Error("New health " + new_health.toString() + " is greater than max health " + this.max_health.toString());
        }
        this._health = new_health;
        this.health_td.textContent = new_health.toString();
    }

    get overheal() {
        return this._overheal;
    }
    set overheal(amount) {
        if (amount < 0) {
            throw new Error("Overheal can't be negative");
        }
        this._overheal = amount;
        this.overheal_td.textContent = amount.toString();
    }
    get status_effects() {
        let combined_status_effects: StatusEffect[] = [];
        for (let status_effect_color in this._status_effects) {
            combined_status_effects = combined_status_effects.concat(set_to_array(this._status_effects[status_effect_color]));
        }
        return combined_status_effects;
    }

    has_status_effect(status_effect: StatusEffect) {
        const color = status_effect_get_color(status_effect);
        if (this._status_effects[color] === undefined) {
            this._status_effects[color] = new Set;
        }
        return this._status_effects[color].has(status_effect);
    }

    add_status_effect(status_effect: StatusEffect) {
        const color = status_effect_get_color(status_effect);
        if (this._status_effects[color] === undefined) {
            this._status_effects[color] = new Set;
        }
        this._status_effects[color].add(status_effect);
        this.status_effect_tds[status_effect].style.opacity = "1";
    }

    remove_status_effect(status_effect: StatusEffect) {
        const color = status_effect_get_color(status_effect);
        if (this._status_effects[color] === undefined) {
            this._status_effects[color] = new Set;
        }
        this._status_effects[color].delete(status_effect);
        this.status_effect_tds[status_effect].style.opacity = ".1";
    }

    is_healable_by(healer: Entity) {
        return (!this.has_status_effect(StatusEffect.Stasis) &&
                 this.team === healer.team);
    }

    heal_health(percent_to_add: number) {
        const health_to_add = this.max_health * percent_to_add / 100;
        let new_health = Math.floor(health_to_add + this.health);
        if (new_health > this.max_health) {
            this.health = this.max_health; 
            this.overheal += new_health - this.max_health;
        } else {
            this.health = new_health;
        }
    }

    get_healable_party_members() {
        if (this.party.length < 2) {
            // If there is no formal party or only the player themselves is in it, do an AoE heal (not implemented here)
            // party === some_aoe_function(this);
        } else {
            party = this.party;
        }

        let healable_party_members: Entity[] = [];
        for (let party_member of this.party) {
            if (party_member.is_healable_by(this)) {
                healable_party_members.push(party_member);
            }
        }
        return healable_party_members;
    }

    static heal_health_group(party: Entity[], base_percent: number) {
        let percent_to_add = base_percent;
        for (let i = 0; i < party.length - 1; i += 1) { // Multiplicative penalty for more players
            percent_to_add = percent_to_add * (100 - heal_percent_reduction_per_target) / 100;
        }
        for (let party_member of party) {
            party_member.heal_health(percent_to_add);
        }
    }
}

// This is for player entities, who have healing skills and cooldowns that NPCs and other entities don't, also populates a hacky UI from a player's perspective via render()
class Player extends Entity {
    private _healing_on_cooldown = false;
    private _heal_button_active: HealButtonColor = 0;

    // Hacky front-end stuff
    private _heal_button_tds: HTMLTableCellElement[] = [];
    private _button_row = document.createElement("tr");

    constructor(name: string, health: number, max_health: number, team: string) {
        super(name, health, max_health, team);
    }

    private set_healing_cooldown(ms: number) {
        this._healing_on_cooldown = true;
        this._button_row.style.opacity = ".1";
        let self: Player = this;
        setTimeout(function () {
            self._healing_on_cooldown = false;
            self._button_row.style.opacity = "1";
        }, ms);
    }

    // Separate out so the message is only in one place
    private target_healable(target: Entity) {
        if (!target.is_healable_by(this)) {
            if (target === this) {
                alert("You can't heal yourself! (Stasis prevents healing)");
            } else {
                alert("You can't heal that target! (Stasis, mismatched Team prevent healing)");
            }
            return false;
        }
        return true;
    }
    private party_healable() {
        let party = this.get_healable_party_members();
        if (party.length < 1) {
            alert("No one in your party is healable! (Stasis, mismatched Team prevent healing)");
        }
        return party;
    }

    private red_heal_target(target: Entity) {
        if (!this.target_healable(target)) {
            return;
        }
        target.heal_health(base_heal_percent * red_heal_target_multiplier);
        this.set_healing_cooldown(red_heal_target_cooldown);
    }

    private red_heal_party() {
        const healable_party_members = this.party_healable();
        if (healable_party_members.length < 1) {
            return;
        }
        if (healable_party_members.length < 2 && healable_party_members[0] === this) {
            this.red_heal_target(this); // If it's just the player, give them the targeted heal cooldown as a convenience
            return;
        }
        Entity.heal_health_group(healable_party_members, base_heal_percent * red_heal_party_multiplier);
        this.set_healing_cooldown(red_heal_party_cooldown);
    }

    private color_match(status_effect: StatusEffect, heal_button_color: HealButtonColor) {
        if (status_effect_get_color(status_effect) !== heal_button_heals_status_effect_color(heal_button_color)) {
            this.set_healing_cooldown(wrong_color_status_effect_cooldown);
            return false;
        }
        return true;
    }

    private other_color_heal_status_effect(target: Entity, status_effect: StatusEffect, heal_button_color: HealButtonColor) {
        if (!this.target_healable(target)) {
            return;
        }
        if (!this.color_match(status_effect, heal_button_color)) {
            return;
        }
        target.remove_status_effect(status_effect);
        this.set_healing_cooldown(other_color_heal_status_effect_cooldown);
    }

    private other_color_heal_target(target: Entity, heal_button_color: HealButtonColor) {
        if (!this.target_healable(target)) {
            return;
        }
        const heal_color = heal_button_heals_status_effect_color(heal_button_color);
        if (target._status_effects[heal_color] === undefined) {
            // If the set doesn't exist yet, there are no status effects of that color
            this.set_healing_cooldown(wrong_color_status_effect_cooldown);
            return;
        }
        const status_effects = set_to_array(target._status_effects[heal_color]); // Get all the status effects of the heal's color on the player
        if (status_effects.length < 1) {
            // Target has no status effects of the heal's color
            this.set_healing_cooldown(wrong_color_status_effect_cooldown);
            return;
        }
        target.remove_status_effect(random_array_element(status_effects)); // Remove a random status effect of the heal's color
        this.set_healing_cooldown(other_color_heal_target_cooldown);
    }

    private other_color_heal_party(heal_button_color: HealButtonColor) {
        const healable_party_members = this.party_healable();
        if (healable_party_members.length < 1) {
            return;
        }
        if (healable_party_members.length < 2 && healable_party_members[0] === this) {
            this.other_color_heal_target(this, heal_button_color); // If it's just the player, give them the targeted heal cooldown as a convenience
            return;
        }
        const heal_color = heal_button_heals_status_effect_color(heal_button_color);

        let healed_something = false;
        for (let party_member of healable_party_members) {
            if (party_member._status_effects[heal_color] === undefined) {
                // If the set doesn't exist yet, there are no status effects of this color
                continue;
            }
            const status_effects = set_to_array(party_member._status_effects[heal_color]); // Get all the status effects of the heal's color on the player
            if (status_effects.length < 1) {
                // Target has no status effects of the heal's color
                continue;
            }
            party_member.remove_status_effect(random_array_element(status_effects)); // Remove a random status effect of the heal's color
            healed_something = true;
        }
        this.set_healing_cooldown(healed_something ? other_color_heal_party_cooldown : wrong_color_status_effect_cooldown);
    }

    private tri_color_heal_status_effect(target: Entity, status_effect: StatusEffect) {
        if (!this.target_healable(target)) {
            return;
        }
        target.remove_status_effect(status_effect);
        this.set_healing_cooldown(tri_color_heal_status_effect_cooldown);
    }

    private tri_color_heal_target(target: Entity) {
        if (!this.target_healable(target)) {
            return;
        }
        const status_effects = target.status_effects;
        if (status_effects.length < 1) {
            target.heal_health(base_heal_percent * tri_color_heal_target_multiplier); // They have no status effects, so heal their health instead
        } else {
            target.remove_status_effect(random_array_element(status_effects)); // Heal a random status effect
        }
        this.set_healing_cooldown(tri_color_heal_target_cooldown);
    }

    private tri_color_heal_party() {
        const healable_party_members = this.party_healable();
        if (healable_party_members.length < 1) {
            return;
        }
        if (healable_party_members.length < 2 && healable_party_members[0] === this) {
            this.tri_color_heal_target(this); // If it's just the player, give them the targeted heal cooldown as a convenience
            return;
        }
        for (let party_member of healable_party_members) {
            const status_effects = party_member.status_effects;
            if (status_effects.length < 1) {
                party_member.heal_health(base_heal_percent * tri_color_heal_target_multiplier); // They have no status effects, so heal their health instead
            } else {
                party_member.remove_status_effect(random_array_element(status_effects)); // Heal a random status effect
            }
        }
        this.set_healing_cooldown(tri_color_heal_party_cooldown);
    }
    
    // Cross-reference target type with which color heal was active during click
    private target_heal(target: Entity) {
        switch (this._heal_button_active) {
            case HealButtonColor.Tricolor:
                this.tri_color_heal_target(target);
                break;
            case HealButtonColor.Red:
                this.red_heal_target(target);
                break;
            default:
                this.other_color_heal_target(target, this._heal_button_active);
        }
    }
    private untargeted_heal() {
        switch (this._heal_button_active) {
            case HealButtonColor.Tricolor:
                this.tri_color_heal_party();
                break;
            case HealButtonColor.Red:
                this.red_heal_party();
                break;
            default:
                this.other_color_heal_party(this._heal_button_active);
        }
    }
    private status_effect_icon_heal(target: Entity, status_effect: StatusEffect) {
        if (this._heal_button_active === HealButtonColor.Tricolor) {
            this.tri_color_heal_status_effect(target, status_effect);
        } else {
            this.other_color_heal_status_effect(target, status_effect, this._heal_button_active);
        }
    }



    //
    // Extremely hacky front-end code for testing
    //
    private begin_healing_mode() {
        for (let heal_button_td of this._heal_button_tds) {
            heal_button_td.style.opacity = ".5";
        }
        set_ui_mode(UIMode.Healing);
    }

    private end_healing_mode() {
        for (let heal_button_td of this._heal_button_tds) {
            heal_button_td.style.opacity = "1";
        }
        set_ui_mode(UIMode.Default);
    }
    render_ui() {
        // Populate the UI frames from this player's perspective, with their healing skills, etc.
        const self = this;
        // Render the party
        for (let party_member of this.party) {
            party_member.name_td.innerText = party_member.name;
            party_member.tr.appendChild(party_member.name_td);

            // Health
            party_member.health_td.innerText = party_member.health.toString();
            // Button for editing health
            party_member.health_td.addEventListener("click", function () {
                if (ui_mode === UIMode.Editing) {
                    let new_health = prompt("Edit health", party_member.health.toString());
                    if (new_health !== null) {
                        party_member.health = parseInt(new_health as string);
                    }
                }
            });
            party_member.tr.appendChild(party_member.health_td);

            // Max Health
            party_member.max_health_td.innerText = party_member.max_health.toString();
            // Button for editing max health
            party_member.max_health_td.addEventListener("click", function () {
                if (ui_mode === UIMode.Editing) {
                    let new_health = prompt("Edit max health", party_member.max_health.toString());
                    if (new_health !== null) {
                        party_member.max_health = parseInt(new_health as string);
                    }
                }
            });
            party_member.tr.appendChild(party_member.max_health_td);

            // Overheal
            party_member.overheal_td.innerText = party_member.overheal.toString();
            party_member.tr.appendChild(party_member.overheal_td);

            // Team
            party_member.team_td.innerText = party_member.team;
            // Button for editing team
            party_member.team_td.addEventListener("click", function () {
                if (ui_mode === UIMode.Editing) {
                    let new_team = prompt("Team name", party_member.team.toString());
                    if (new_team !== null) {
                        party_member.team = new_team as string;
                        this.innerText = party_member.team.toString();
                    }
                }
            });
            party_member.tr.appendChild(party_member.team_td);

            // Status effects
            for (let status_effect = 0; status_effect < number_of_status_effects; status_effect++) {
                let td = document.createElement("td");
                let status_effect_name = status_effect_to_string.get(status_effect);
                if (status_effect_name === undefined) {
                    throw new Error("Tried to create element for nonexistent variety of status effect")
                }
                td.innerText = status_effect_name as string;
                td.style.color = "white";
                td.style.opacity = ".1";
                let status_effect_color = status_effect_get_color(status_effect);
                td.style.backgroundColor = status_effect_color_to_string.get(status_effect_color) as string;
                // Status effect buttons
                td.addEventListener("click", function (event) {
                    if (ui_mode === UIMode.Editing) {
                        // Toggle status effects on/off in edit mode
                        if (party_member.has_status_effect(status_effect)) {
                            party_member.remove_status_effect(status_effect);
                        } else {
                            party_member.add_status_effect(status_effect);
                        }
                    } else if (ui_mode === UIMode.Healing &&
                               self._heal_button_active !== HealButtonColor.Red && // Red can't heal status effects, so let event bubble up
                               party_member.has_status_effect(status_effect)) { // If the icon is inactive, let event bubble up
                        // Status effect click target for specific-status-effect healing
                        event.stopPropagation();
                        self.status_effect_icon_heal(party_member, status_effect);
                        self.end_healing_mode();
                    }
                });
                party_member.status_effect_tds[status_effect] = td;
                party_member.tr.appendChild(party_member.status_effect_tds[status_effect]);
            }

            // Click target for party member heals
            party_member.tr.addEventListener("click", function (event) {
                if (ui_mode === UIMode.Healing) {
                    event.stopPropagation();
                    self.target_heal(party_member);
                    self.end_healing_mode();
                }
            });

            entity_display_table.appendChild(party_member.tr);
        }

        // Render the healing button UI
        const td_width = Math.floor(80 / number_of_heal_button_colors).toString() + "%";
        for (let heal_button_color = 0; heal_button_color < number_of_heal_button_colors; heal_button_color++) {
            let td = document.createElement("td");
            td.style.width = td_width;
            let heal_button_name = heal_button_color_to_string.get(heal_button_color);
            if (heal_button_name === undefined) {
                throw new Error("Tried to create element for nonexistent variety of status effect")
            }
            td.textContent = heal_button_name as string;
            if (heal_button_color === HealButtonColor.Tricolor) {
                td.style.backgroundImage = heal_button_color_to_css_color.get(heal_button_color) as string;
            } else {
                td.style.backgroundColor = heal_button_color_to_css_color.get(heal_button_color) as string;
            }
            // Healing button callbacks
            td.addEventListener("click", (event) => {
                if (ui_mode !== UIMode.Default || this._healing_on_cooldown) {
                   return;
                }
                this._heal_button_active = heal_button_color;
                this.begin_healing_mode();
                event.stopPropagation();
            });
            this._heal_button_tds[heal_button_color] = td;
            this._button_row.appendChild(this._heal_button_tds[heal_button_color]);
        }
        this._button_row.style.width = "80%";
        heal_display_table.appendChild(this._button_row);

        heal_display_table.style.color = "white";
        heal_display_table.style.textAlign = "center";

        // Click target for untargeted heals
        display_area.addEventListener("click", function () {
            if (ui_mode === UIMode.Healing) {
                self.end_healing_mode();
                self.untargeted_heal();
            }
        });
    }
}

// Make a hacky display
const display_area = document.createElement("div");
display_area.id = "display-area";

function remove_display_area() {
    const existing_display_area = document.getElementById(display_area.id);
    if (existing_display_area && existing_display_area.parentElement) {
        existing_display_area.parentElement.removeChild(existing_display_area);
    }
}
remove_display_area();

display_area.style.backgroundColor = "white";
display_area.style.backgroundImage = "url(\"https://i.ibb.co/yWWR7td/testbg.png\")";
display_area.style.color = "black";
display_area.style.position = "fixed";
display_area.style.bottom = "0";
display_area.style.left = "0";
display_area.style.width = "100%";
display_area.style.height = "50%";
display_area.style.padding = "10x";

const close_button = document.createElement("a");
close_button.textContent = "X";
close_button.style.position = "absolute";
close_button.style.zIndex = "1";
close_button.style.top = "1%";
close_button.style.right = "2%";
close_button.style.cursor = "pointer";
close_button.onclick = function () {
    remove_display_area();
};
display_area.appendChild(close_button);

enum UIMode {
    Default,
    Editing,
    Healing,
}
let ui_mode = UIMode.Default;
function set_ui_mode(mode: UIMode) {
    if (mode === UIMode.Healing) {
        edit_button.style.opacity = ".1";
    } else {
        edit_button.style.opacity = "1";
    }
    ui_mode = mode;
}

const edit_button = document.createElement("div");
edit_button.textContent = "Edit Mode: Disabled";
edit_button.style.fontSize = "large";
edit_button.onclick = function () {
    switch (ui_mode) {
        case UIMode.Healing:
            break;
        case UIMode.Editing:
            set_ui_mode(UIMode.Default);
            edit_button.textContent = "Edit Mode: Disabled";
            break;
        default:
            set_ui_mode(UIMode.Editing);
            edit_button.textContent = "Edit Mode: Enabled";
    }
}

display_area.appendChild(edit_button);

// Button to add some random status effects every 500 ms for testing
let random_status_effects = false;
const possible_status_effects_to_inflict = [
    StatusEffect.Stasis,
    StatusEffect.Asleep,
    StatusEffect.Burning,
    StatusEffect.Poisoned,
    StatusEffect.Frozen
];
let random_status_effects_timer: number;
const random_status_effects_button = document.createElement("div");
random_status_effects_button.textContent = "Random Status Effects: Disabled";
random_status_effects_button.style.fontSize = "large";
random_status_effects_button.onclick = function () {
    random_status_effects = !random_status_effects;
    random_status_effects_button.textContent = "Random Status Effects: " + (random_status_effects ? "Enabled" : "Disabled");
    if (random_status_effects) {
        random_status_effects_timer = setInterval(function () {
            if (ui_mode !== UIMode.Editing) {
                random_array_element(player.party).add_status_effect(random_array_element(possible_status_effects_to_inflict));
            }
        }, 500);
    } else {
        clearInterval(random_status_effects_timer);
    }
}
display_area.appendChild(random_status_effects_button);

// The table for party entity frames
let entity_display_table = document.createElement("table");
entity_display_table.style.width = "80%";
display_area.appendChild(entity_display_table);

const entity_display_table_header_row = document.createElement("tr");
entity_display_table.style.backgroundColor = "rgba(200, 200, 200, 0.85)";
entity_display_table.appendChild(entity_display_table_header_row);
const headers = ["Name", "Health", "Max Health", "Overheal", "Team", "Status Effects"];
let header_ths: HTMLTableHeaderCellElement[] = [];
for (let i = 0; i < headers.length; i++) {
    header_ths[i] = document.createElement("th");
    header_ths[i].style.textAlign = "left";
    header_ths[i].innerText = headers[i];
    entity_display_table_header_row.appendChild(header_ths[i]);
}

// Table for the heal buttons
let heal_display_table = document.createElement("table");
heal_display_table.style.position = "absolute";
heal_display_table.style.bottom = "1%"
heal_display_table.style.width = "80%";
display_area.appendChild(heal_display_table);

document.body.appendChild(display_area);

// Make some players
const player = new Player("Player McName", 834, 1000, "Foo");
const alice = new Player("Alice", 533, 1100, "Foo"); // Can heal other player
const bob = new Entity("Bob", 545, 1150, "Bar"); // Can heal non-player entities, like NPCs
const carol = new Entity("Carol", 234, 1234, "Foo");

// Put them in a party (this is an ugly way to do parties, but party logic isn't important here)
let party = [player, alice, bob, carol];
player.party = party;
alice.party = party;
bob.party = party;
carol.party = party;

// Populate the hacky UI for the given player
player.render_ui();
