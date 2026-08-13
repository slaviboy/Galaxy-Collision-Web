/**
 * Physical constants used to convert Newton's G into simulation units:
 * distance in parsecs, mass in solar masses, time in years.
 */
export class Constants {
    /** Solar mass in kilograms. */
    public static readonly MassOfSun = 1.988435e30;
    /** One parsec in meters. */
    public static readonly ParsecInMeter = 3.08567758129e16;
    /** Newton's gravitational constant (m^3 kg^-1 s^-2). */
    public static readonly Gamma = 6.67428e-11;
}
