# 3D 资产来源与许可（CC0）

> 本目录全部素材来自 [Poly Haven](https://polyhaven.com)，**许可为 CC0 1.0（公共领域贡献）**：
> 可自由用于商业与非商业用途，无需署名。这里仍逐项记录来源，是为了**可追溯与可复核** ——
> 「CC0」不等于「没有出处」。
>
> 抓取方式：`node scripts/fetch-assets.mjs`（最近一次抓取：2026-10-03）。
> 重新抓取会在文件已存在时跳过，除非加 `--force`。

| 类型 | 资产 | 来源页 | 包含文件 | 说明 |
|---|---|---|---|---|
| model | `coffee_table_round_01` | [coffee_table_round_01](https://polyhaven.com/a/coffee_table_round_01) | coffee_table_round_01_1k.gltf<br>coffee_table_round_01.bin<br>textures/coffee_table_round_01_nor_gl_1k.jpg<br>textures/coffee_table_round_01_diff_1k.jpg<br>textures/coffee_table_round_01_arm_1k.jpg | 4 个附属文件（缓冲 + 贴图） |
| model | `vintage_wooden_drawer_01` | [vintage_wooden_drawer_01](https://polyhaven.com/a/vintage_wooden_drawer_01) | vintage_wooden_drawer_01_1k.gltf<br>vintage_wooden_drawer_01.bin<br>textures/vintage_wooden_drawer_01_nor_gl_1k.jpg<br>textures/vintage_wooden_drawer_01_diff_1k.jpg<br>textures/vintage_wooden_drawer_01_arm_1k.jpg | 4 个附属文件（缓冲 + 贴图） |
| model | `potted_plant_02` | [potted_plant_02](https://polyhaven.com/a/potted_plant_02) | potted_plant_02_1k.gltf<br>potted_plant_02.bin<br>textures/potted_plant_02_pot_nor_gl_1k.jpg<br>textures/potted_plant_02_pot_diff_1k.jpg<br>textures/potted_plant_02_pot_rough_1k.jpg<br>textures/potted_plant_02_leaves_nor_gl_1k.jpg<br>textures/potted_plant_02_leaves_diff_1k.jpg<br>textures/potted_plant_02_leaves_rough_1k.jpg | 7 个附属文件（缓冲 + 贴图） |
| model | `modern_ceiling_lamp_01` | [modern_ceiling_lamp_01](https://polyhaven.com/a/modern_ceiling_lamp_01) | modern_ceiling_lamp_01_1k.gltf<br>modern_ceiling_lamp_01.bin<br>textures/modern_ceiling_lamp_01_nor_gl_1k.jpg<br>textures/modern_ceiling_lamp_01_diff_1k.jpg<br>textures/modern_ceiling_lamp_01_arm_1k.jpg | 4 个附属文件（缓冲 + 贴图） |
| texture | `wood_floor_deck` | [wood_floor_deck](https://polyhaven.com/a/wood_floor_deck) | wood_floor_deck_diff_1k.jpg<br>wood_floor_deck_rough_1k.jpg<br>wood_floor_deck_nor_gl_1k.jpg | 平铺 PBR |
| texture | `painted_plaster_wall` | [painted_plaster_wall](https://polyhaven.com/a/painted_plaster_wall) | painted_plaster_wall_diff_1k.jpg<br>painted_plaster_wall_rough_1k.jpg | 平铺 PBR |
| texture | `marble_01` | [marble_01](https://polyhaven.com/a/marble_01) | marble_01_diff_1k.jpg | 平铺 PBR |
| env | `hotel_room` | [hotel_room](https://polyhaven.com/a/hotel_room) | hotel_room_1k.hdr | 室内 HDRI，仅作环境光（IBL） |

## 为什么只抓这些

- 家具「英雄件」用扫描模型补真实感（沙发、茶几、书架、单人椅、绿植、落地灯、靠垫、床架）；
  冰箱、电视、厨房、衣柜、猫爬架、猫砂盆、饮水机等**没有合适的 CC0 扫描件**，一律程序化建模，
  这样它们的尺寸与位置可以严格服从房间布局与指南要求。
- 平铺贴图只保留三张「大面积、决定观感」的：木地板、墙面、石材台面；
  织物与金属用程序化贴图生成，把仓库体积留给更值钱的地方。
- 猫没有可信的 CC0 写实模型（Poly Haven 521 个模型中只有 `concrete_cat_statue` 这类雕塑），
  因此橘猫是程序化重建：比例与毛色写实，但不是照片级扫描。替换缝见 `scene/cat/cat-model.ts`。
