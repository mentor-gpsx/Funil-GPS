"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntriesController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const entries_service_1 = require("./entries.service");
const entry_lines_service_1 = require("./entry-lines.service");
const create_entry_dto_1 = require("./dto/create-entry.dto");
const post_entry_dto_1 = require("./dto/post-entry.dto");
const reverse_entry_dto_1 = require("./dto/reverse-entry.dto");
let EntriesController = class EntriesController {
    entriesService;
    linesService;
    constructor(entriesService, linesService) {
        this.entriesService = entriesService;
        this.linesService = linesService;
    }
    async create(createEntryDto) {
        return this.entriesService.create(createEntryDto);
    }
    async findAll(page = 1, limit = 50, status, dateFrom, dateTo) {
        const result = await this.entriesService.findAll(page, limit, status, dateFrom, dateTo);
        return {
            ...result,
            page,
            limit,
        };
    }
    async findOne(id) {
        return this.entriesService.findOne(id);
    }
    async post(id, _postEntryDto) {
        return this.entriesService.post(id);
    }
    async reverse(id, reverseEntryDto) {
        return this.entriesService.reverse(id, reverseEntryDto);
    }
    async addLine(id, createLineDto) {
        return this.linesService.addLine(id, createLineDto);
    }
    async editLine(id, lineId, createLineDto) {
        return this.linesService.editLine(id, lineId, createLineDto);
    }
    async deleteLine(id, lineId) {
        return this.linesService.deleteLine(id, lineId);
    }
};
exports.EntriesController = EntriesController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_entry_dto_1.CreateEntryDto]),
    __metadata("design:returntype", Promise)
], EntriesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('dateFrom')),
    __param(4, (0, common_1.Query)('dateTo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String, String]),
    __metadata("design:returntype", Promise)
], EntriesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EntriesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/post'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, post_entry_dto_1.PostEntryDto]),
    __metadata("design:returntype", Promise)
], EntriesController.prototype, "post", null);
__decorate([
    (0, common_1.Post)(':id/reverse'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, reverse_entry_dto_1.ReverseEntryDto]),
    __metadata("design:returntype", Promise)
], EntriesController.prototype, "reverse", null);
__decorate([
    (0, common_1.Post)(':id/lines'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_entry_dto_1.CreateEntryLineDto]),
    __metadata("design:returntype", Promise)
], EntriesController.prototype, "addLine", null);
__decorate([
    (0, common_1.Patch)(':id/lines/:lineId'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('lineId')),
    __param(2, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_entry_dto_1.CreateEntryLineDto]),
    __metadata("design:returntype", Promise)
], EntriesController.prototype, "editLine", null);
__decorate([
    (0, common_1.Delete)(':id/lines/:lineId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('lineId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], EntriesController.prototype, "deleteLine", null);
exports.EntriesController = EntriesController = __decorate([
    (0, common_1.Controller)('api/entries'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [entries_service_1.EntriesService,
        entry_lines_service_1.EntryLinesService])
], EntriesController);
//# sourceMappingURL=entries.controller.js.map