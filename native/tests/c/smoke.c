/* Loads a .chipsong, renders a second of stereo audio and checks it's not silent. */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>

#include "chipforge.h"

int main(int argc, char **argv) {
    if (argc < 2 || chipforge_api_version() != CHIPFORGE_API_VERSION) return 2;
    FILE *f = fopen(argv[1], "rb");
    if (!f) return 3;
    unsigned char data[65536];
    size_t len = fread(data, 1, sizeof data, f);
    fclose(f);

    ChipforgePlayer *player = chipforge_player_new(44100.0f);
    int32_t err = chipforge_player_load(player, data, len);
    if (err != CHIPFORGE_OK) {
        printf("load failed: %s\n", chipforge_error_message(err));
        return 4;
    }
    chipforge_player_play(player, 0, 0);
    static float out[44100 * 2];
    chipforge_player_render(player, out, 44100, 2);
    double sum = 0;
    for (size_t i = 0; i < 44100 * 2; i++) sum += out[i] * out[i];
    chipforge_player_free(player);
    if (sqrt(sum / (44100 * 2)) < 0.01) {
        printf("silent\n");
        return 5;
    }
    printf("ok\n");
    return 0;
}
