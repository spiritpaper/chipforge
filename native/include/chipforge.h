/*
 * ChipForge native player: plays .chipsong files (exported from the ChipForge web app)
 * on an emulated NES sound chip, for game engines and native apps.
 *
 * Threading: a player is not thread-safe. Create and drive it from one thread, which
 * is normally the audio callback (load, play and the setters are cheap enough to call
 * there); if you control it from another thread, add your own lock.
 *
 * All functions accept NULL players and ignore them (returning 0 / -1 where they
 * return something), so a failed chipforge_player_new can't crash a game.
 */
#ifndef CHIPFORGE_H
#define CHIPFORGE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CHIPFORGE_API_VERSION 1
#define CHIPFORGE_CHANNELS 4 /* pulse 1, pulse 2, triangle, noise */

/* Error codes from chipforge_player_load. */
#define CHIPFORGE_OK 0
#define CHIPFORGE_ERR_NOT_A_SONG -1      /* wrong magic: not a .chipsong file */
#define CHIPFORGE_ERR_NEWER_VERSION -2   /* made by a newer ChipForge */
#define CHIPFORGE_ERR_TRUNCATED -3       /* file cut short */
#define CHIPFORGE_ERR_BAD_HEADER -4      /* a setting is out of range */
#define CHIPFORGE_ERR_BAD_ORDER -5       /* order list points at a missing pattern */
#define CHIPFORGE_ERR_NULL -6            /* NULL player or data */

typedef struct ChipforgePlayer ChipforgePlayer;

/* Returns CHIPFORGE_API_VERSION of the library actually loaded. */
uint32_t chipforge_api_version(void);
/* A short English description of an error code. Never NULL. */
const char *chipforge_error_message(int32_t code);

ChipforgePlayer *chipforge_player_new(float sample_rate);
void chipforge_player_free(ChipforgePlayer *player);

/* Loads a .chipsong file's bytes (copied). Keeps playing if already playing. */
int32_t chipforge_player_load(ChipforgePlayer *player, const uint8_t *data, size_t len);

/* Starts at an order entry (song section) and row; 0, 0 is the beginning. */
void chipforge_player_play(ChipforgePlayer *player, uint32_t order, uint32_t row);
void chipforge_player_stop(ChipforgePlayer *player);
int32_t chipforge_player_is_playing(const ChipforgePlayer *player);
/* Current order entry and row, or -1 when stopped. */
int32_t chipforge_player_order(const ChipforgePlayer *player);
int32_t chipforge_player_row(const ChipforgePlayer *player);
uint32_t chipforge_player_order_count(const ChipforgePlayer *player);
/* Times the song has looped since play. */
uint32_t chipforge_player_loops(const ChipforgePlayer *player);

/* Adaptive music. */
/* Switch to an order entry when the current pattern ends (on the bar line). */
void chipforge_player_queue_order(ChipforgePlayer *player, uint32_t order);
/* Silence or restore a channel (0..3): fade layers in and out. */
void chipforge_player_set_muted(ChipforgePlayer *player, uint32_t channel, int32_t muted);
/* Tempo multiplier, 0.25..4. */
void chipforge_player_set_tempo_scale(ChipforgePlayer *player, float scale);
/* Output gain, 0..2 (1 = as authored). */
void chipforge_player_set_volume(ChipforgePlayer *player, float volume);
/* Nonzero: stop at the end instead of looping (jingles). */
void chipforge_player_set_play_once(ChipforgePlayer *player, int32_t on);
/* Returns 1 once after a play-once song has ended, else 0. */
int32_t chipforge_player_take_finished(ChipforgePlayer *player);

/*
 * Renders `frames` frames of interleaved float audio (-1..1) with `channels`
 * channels per frame (1 = mono, 2 = stereo; the chip is mono, so channels repeat).
 * `out` must hold frames * channels floats. Renders silence when stopped.
 */
void chipforge_player_render(ChipforgePlayer *player, float *out, size_t frames, uint32_t channels);

#ifdef __cplusplus
}
#endif

#endif /* CHIPFORGE_H */
