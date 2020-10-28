export interface FeatureValue {
    raw: any
    string(): string
    boolean(): boolean
}

/**
 * Current state of the feature toggles
 */
export interface FeatureState {
    [feature: string]:
        | {
              value: FeatureValue

              /** User overridable */
              canUserOverride: boolean

              userOverride?: FeatureValue
          }
        | undefined
}

export function isFeatureEnabled<Features extends string>(
    toggles: FeatureState,
    feature: Features,
    fallback = false,
): boolean {
    const featureState = toggles[feature]
    if (!featureState) {
        return fallback
    }

    return featureState.userOverride?.boolean() ?? featureState.value.boolean()
}
